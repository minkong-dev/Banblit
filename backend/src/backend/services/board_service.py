from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from backend.services.input import require_non_empty
from backend.services.permission_service import account_permissions
from backend.db.models import Comment, Member, Post, Team, TeamSlot

# 글, 작성자 이름, 댓글 수, 가린 사람 이름(가려지지 않았으면 None)입니다.
PostRow = tuple[Post, str, int, str | None]
CommentRow = tuple[Comment, str]


def _require_team_exists(session: Session, team_id: int) -> None:
    if session.get(Team, team_id) is None:
        raise ValueError("그런 팀이 없습니다")


def _require_team_member(session: Session, team_id: int, member_id: int) -> None:
    # 인증된 사람이라도 팀 소속이 아니면 PermissionError(403)입니다. 팀이나 게시글이 없는 경우는
    # ValueError(422)이며, 응답 상태 코드가 다르므로 구분합니다.
    row = session.execute(
        select(TeamSlot.id).where(
            TeamSlot.team_id == team_id,
            TeamSlot.member_id == member_id,
        )
    ).first()
    if row is None:
        raise PermissionError("그 팀 소속이 아닙니다")


def require_post_readable(session: Session, post_id: int, requester: Member) -> Post:
    """post_id 의 게시글을 반환합니다. 팀 게시판 게시글이면 requester 가 해당 팀 소속이어야 합니다.

    공지사항(team_id 가 None 인 경우)은 로그인한 사람 누구나 읽으므로 팀 소속을 확인하지 않습니다.
    """
    post = session.get(Post, post_id)
    if post is None or post.blinded_at is not None:
        # 가려진 글과 없는 글을 같은 문장으로 거절합니다. 문장을 나누면 글이 있다는 사실이 드러납니다.
        raise ValueError("그런 글이 없습니다")
    if post.team_id is not None:
        _require_team_member(session, post.team_id, requester.id)
    return post


def _moderates(session: Session, requester: Member) -> bool:
    return "board_moderate" in account_permissions(session, requester.id)


def require_post_author(
    session: Session, post_id: int, requester: Member, *, allow_moderator: bool = True
) -> Post:
    """게시글을 읽을 수 있는지 먼저 확인한 뒤, 작성자이면 게시글을 반환합니다.

    board_moderate 권한을 가진 사람은 다른 사람의 글도 삭제할 수 있고, 그때는 팀 소속을 확인하지
    않습니다. 확인하면 그 팀에 속하지 않은 사람이 부적절한 글을 처리할 수 없어 이 권한이 팀 게시판에서는
    쓸모가 없어집니다. 내용을 고치는 것은 이 권한으로도 할 수 없습니다(allow_moderator=False) —
    남의 글을 고치면 누가 쓴 말인지가 흐려집니다.
    """
    if allow_moderator and _moderates(session, requester):
        post = session.get(Post, post_id)
        if post is None:
            raise ValueError("그런 글이 없습니다")
        return post
    post = require_post_readable(session, post_id, requester)
    if post.author_id != requester.id:
        raise PermissionError("글쓴이만 할 수 있습니다")
    return post


def _comment_counts(session: Session, post_ids: list[int]) -> dict[int, int]:
    if not post_ids:
        return {}
    return {
        post_id: count
        for post_id, count in session.execute(
            select(Comment.post_id, func.count(Comment.id))
            .where(Comment.post_id.in_(post_ids))
            .group_by(Comment.post_id)
        ).all()
    }


def _posts_with_author_and_count(session: Session, team_id: int | None) -> list[PostRow]:
    """team_id 가 None 이면 공지사항, 아니면 해당 팀의 게시판 게시글을 최신순으로 반환합니다.

    게시글마다 작성자와 댓글 수를 따로 조회하지 않습니다. Member 는 join 으로 한 번에 가져오고, 댓글 수는 post_id 목록으로 한 번에 집계합니다.
    """
    condition = Post.team_id.is_(None) if team_id is None else Post.team_id == team_id
    rows = session.execute(
        select(Post, Member.name)
        .join(Member, Member.id == Post.author_id)
        .where(condition, Post.blinded_at.is_(None))
        .order_by(Post.created_at.desc(), Post.id.desc())
    ).all()
    counts = _comment_counts(session, [post.id for post, _ in rows])
    # 이 목록은 가려지지 않은 글만 담으므로 가린 사람도 언제나 없습니다.
    return [(post, author, counts.get(post.id, 0), None) for post, author in rows]


def list_blinded_posts(session: Session) -> list[PostRow]:
    """가려진 글을 가려진 순서의 역순으로 반환합니다. board_moderate 를 가진 사람만 조회합니다(endpoint 가 판정).

    팀 소속을 확인하지 않습니다. 가린 글을 다시 판단하려면 그 팀에 속하지 않은 사람도 봐야 합니다.
    """
    # 가린 사람은 작성자와 다른 행이므로 members 를 한 번 더 join 합니다. 그 계정이 삭제되면
    # blinded_by_id 가 비므로 바깥 join(isouter)으로 붙입니다.
    blinder = aliased(Member)
    rows = session.execute(
        select(Post, Member.name, blinder.name)
        .join(Member, Member.id == Post.author_id)
        .join(blinder, blinder.id == Post.blinded_by_id, isouter=True)
        .where(Post.blinded_at.is_not(None))
        .order_by(Post.blinded_at.desc(), Post.id.desc())
    ).all()
    counts = _comment_counts(session, [post.id for post, _, _ in rows])
    return [
        (post, author, counts.get(post.id, 0), blinded_by)
        for post, author, blinded_by in rows
    ]


def set_post_blinded(
    session: Session, post_id: int, blinded_at: datetime | None, requester: Member
) -> None:
    """글을 가리거나(blinded_at 에 시각) 되돌립니다(None). 권한 판정은 endpoint 가 합니다.

    가릴 때는 requester 를 함께 남기고, 되돌릴 때는 시각과 함께 비웁니다. 권한자가 여럿일 때 사후에
    누가 처리했는지 확인하기 위해서입니다.

    require_post_readable 을 거치지 않습니다. 그 함수는 가려진 글을 없는 글로 거절하므로, 거치면
    되돌리기가 불가능해집니다. 팀 소속도 확인하지 않습니다 — 가리는 사람은 그 팀 사람이 아닙니다.
    """
    post = session.get(Post, post_id)
    if post is None:
        raise ValueError("그런 글이 없습니다")
    post.blinded_at = blinded_at
    post.blinded_by_id = requester.id if blinded_at is not None else None
    session.commit()


def list_notices(session: Session) -> list[PostRow]:
    return _posts_with_author_and_count(session, team_id=None)


def create_notice(
    session: Session, title: str, body: str, requester: Member, created_at: datetime
) -> tuple[Post, str]:
    """공지사항 하나를 만듭니다. 작성자는 요청 본문이 아니라 token(임시로 발급하는 인증 문자열)으로 확인한 requester 입니다.

    쓰기 권한 확인은 endpoint(API 의 요청 주소 단위, routers/boards.py)의 notice_write 에서 합니다.
    """
    clean_title = require_non_empty(title, "제목")
    clean_body = require_non_empty(body, "내용")

    post = Post(
        team_id=None,
        title=clean_title,
        body=clean_body,
        author_id=requester.id,
        created_at=created_at,
    )
    session.add(post)
    session.commit()
    return post, requester.name


def list_team_posts(session: Session, team_id: int, requester: Member) -> list[PostRow]:
    _require_team_exists(session, team_id)
    _require_team_member(session, team_id, requester.id)
    return _posts_with_author_and_count(session, team_id=team_id)


def create_team_post(
    session: Session,
    team_id: int,
    title: str,
    body: str,
    requester: Member,
    created_at: datetime,
) -> tuple[Post, str]:
    """팀 게시판 게시글 하나를 만듭니다. 작성자는 token 으로 확인한 requester 이며, 해당 팀 소속이어야 합니다."""
    clean_title = require_non_empty(title, "제목")
    clean_body = require_non_empty(body, "내용")
    _require_team_exists(session, team_id)
    _require_team_member(session, team_id, requester.id)

    post = Post(
        team_id=team_id,
        title=clean_title,
        body=clean_body,
        author_id=requester.id,
        created_at=created_at,
    )
    session.add(post)
    session.commit()
    return post, requester.name


def get_post_with_comments(
    session: Session, post_id: int, requester: Member
) -> tuple[Post, str, list[CommentRow]]:
    """게시글 하나(작성자 이름 포함)와 댓글 목록(생성된 순서대로, 작성자 이름 포함)을 반환합니다."""
    post = require_post_readable(session, post_id, requester)
    post_author = session.scalar(select(Member.name).where(Member.id == post.author_id)) or ""

    comment_rows = session.execute(
        select(Comment, Member.name)
        .join(Member, Member.id == Comment.author_id)
        .where(Comment.post_id == post_id)
        .order_by(Comment.created_at, Comment.id)
    ).tuples().all()
    return post, post_author, [(comment, author) for comment, author in comment_rows]


def update_post(
    session: Session, post_id: int, title: str, body: str, requester: Member
) -> tuple[Post, str]:
    """게시글을 수정합니다. 작성자 본인만 수정할 수 있습니다. board_moderate 를 가진 사람도 남의 글은 고치지 못합니다."""
    post = require_post_author(session, post_id, requester, allow_moderator=False)
    post.title = require_non_empty(title, "제목")
    post.body = require_non_empty(body, "내용")
    session.commit()
    return post, requester.name


def require_comment_author(
    session: Session, comment_id: int, requester: Member, *, allow_moderator: bool = True
) -> Comment:
    """댓글 작성자 본인이면 그 댓글을 반환합니다. 삭제는 board_moderate 권한을 가진 사람도 할 수 있습니다.

    댓글이 달린 게시글을 읽을 수 있는지도 함께 확인합니다. 팀 게시판의 댓글은 해당 팀 소속만 접근할 수 있으며, 팀에서 제외된 후에는 자신의 댓글도 수정할 수 없습니다.
    """
    comment = session.get(Comment, comment_id)
    if comment is None:
        raise ValueError("그런 댓글이 없습니다")
    if allow_moderator and _moderates(session, requester):
        return comment
    require_post_readable(session, comment.post_id, requester)
    if comment.author_id != requester.id:
        raise PermissionError("댓글을 쓴 사람만 할 수 있습니다")
    return comment


def update_comment(
    session: Session, comment_id: int, body: str, requester: Member
) -> tuple[Comment, str]:
    comment = require_comment_author(session, comment_id, requester, allow_moderator=False)
    comment.body = require_non_empty(body, "댓글")
    session.commit()
    return comment, requester.name


def delete_comment(session: Session, comment_id: int, requester: Member) -> None:
    comment = require_comment_author(session, comment_id, requester)
    session.delete(comment)
    session.commit()


def create_comment(
    session: Session, post_id: int, body: str, requester: Member, created_at: datetime
) -> tuple[Comment, str]:
    """댓글 하나를 만듭니다. 게시글이 팀 게시판 게시글이면 글쓰기와 같은 규칙으로 팀 소속을 확인합니다."""
    clean_body = require_non_empty(body, "댓글")
    require_post_readable(session, post_id, requester)

    comment = Comment(
        post_id=post_id, body=clean_body, author_id=requester.id, created_at=created_at
    )
    session.add(comment)
    session.commit()
    return comment, requester.name
