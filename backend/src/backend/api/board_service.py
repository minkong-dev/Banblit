from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.api.input import require_non_empty
from backend.api.permission_service import account_permissions
from backend.db.models import Comment, Member, Post, Team, TeamSlot

PostRow = tuple[Post, str, int]
CommentRow = tuple[Comment, str]


def _require_team_exists(session: Session, team_id: int) -> None:
    if session.get(Team, team_id) is None:
        raise ValueError("그런 팀이 없습니다")


def _require_team_member(session: Session, team_id: int, member_id: int) -> None:
    # 인증된 사람이라도 팀 소속이 아니면 권한 문제입니다(PermissionError). 팀/게시글이 없는 경우(ValueError)와는 다음에 할 일이 다르므로 구분합니다.
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
    if post is None:
        raise ValueError("그런 글이 없습니다")
    if post.team_id is not None:
        _require_team_member(session, post.team_id, requester.id)
    return post


def require_post_author(session: Session, post_id: int, requester: Member) -> Post:
    """게시글을 읽을 수 있는지 먼저 확인한 뒤, 작성자이면 게시글을 반환합니다.

    board_moderate 권한을 가진 사람은 다른 사람의 글도 수정할 수 있습니다. 부적절한 글을 아무도 처리하지 못하는 상태를 피하기 위함입니다.
    """
    post = require_post_readable(session, post_id, requester)
    if post.author_id != requester.id and "board_moderate" not in account_permissions(
        session, requester.id
    ):
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
        .where(condition)
        .order_by(Post.created_at.desc(), Post.id.desc())
    ).all()
    counts = _comment_counts(session, [post.id for post, _ in rows])
    return [(post, author, counts.get(post.id, 0)) for post, author in rows]


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
    """게시글을 수정합니다. 작성자 본인만 수정할 수 있습니다. require_post_author 에서 판정합니다."""
    post = require_post_author(session, post_id, requester)
    post.title = require_non_empty(title, "제목")
    post.body = require_non_empty(body, "내용")
    session.commit()
    return post, requester.name


def require_comment_author(session: Session, comment_id: int, requester: Member) -> Comment:
    """댓글을 작성한 사람 본인이면 그 댓글을 반환합니다.

    댓글이 달린 게시글을 읽을 수 있는지도 함께 확인합니다. 팀 게시판의 댓글은 해당 팀 소속만 접근할 수 있으며, 팀에서 제외된 후에는 자신의 댓글도 수정할 수 없습니다.
    """
    comment = session.get(Comment, comment_id)
    if comment is None:
        raise ValueError("그런 댓글이 없습니다")
    require_post_readable(session, comment.post_id, requester)
    if (
        comment.author_id != requester.id
        and "board_moderate" not in account_permissions(session, requester.id)
    ):
        raise PermissionError("댓글을 쓴 사람만 할 수 있습니다")
    return comment


def update_comment(
    session: Session, comment_id: int, body: str, requester: Member
) -> tuple[Comment, str]:
    comment = require_comment_author(session, comment_id, requester)
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
