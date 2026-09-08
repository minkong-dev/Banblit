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
    # 인증된 사람이라도 그 팀 소속이 아니면 권한 문제다(PermissionError) — 팀/게시글이
    # 아예 없는 경우(ValueError)와는 사람이 다음에 할 일이 다르므로 구분한다.
    row = session.execute(
        select(TeamSlot.id).where(
            TeamSlot.team_id == team_id,
            TeamSlot.member_id == member_id,
        )
    ).first()
    if row is None:
        raise PermissionError("그 팀 소속이 아닙니다")


def require_post_readable(session: Session, post_id: int, requester: Member) -> Post:
    """게시글 하나를 돌려준다. 팀 게시판 게시글이면 requester 가 그 팀 소속이어야 한다.

    공지(team_id 가 비어 있음)는 로그인한 사람 누구나 읽으므로 소속을 보지 않는다.
    """
    post = session.get(Post, post_id)
    if post is None:
        raise ValueError("그런 글이 없습니다")
    if post.team_id is not None:
        _require_team_member(session, post.team_id, requester.id)
    return post


def require_post_author(session: Session, post_id: int, requester: Member) -> Post:
    """읽을 수 있는지 먼저 보고, 그 게시글을 쓴 사람 본인이면 게시글을 돌려준다.

    board_moderate 를 가진 사람은 남의 글에도 손댈 수 있다 — 부적절한 글을 아무도
    치우지 못하는 상태를 두지 않기 위해서다.
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
    """team_id 가 None 이면 공지, 아니면 그 팀 게시판 게시글을 최신순으로 돌려준다.

    게시글마다 따로 사람·댓글 수를 묻지 않고, Member 는 join 으로 한 번에 붙이고
    댓글 수는 post_id 목록으로 한 번에 집계해 붙인다.
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
    """공지사항 하나를 만든다. 글쓴이는 요청 본문이 아니라 토큰으로 확인한 requester다.

    누가 쓸 수 있는지는 endpoint(routers/boards.py)의 notice_write 확인이 가른다.
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
    """팀 게시판 게시글 하나를 만든다. 글쓴이는 토큰으로 확인한 requester이고, 그 팀
    소속이어야 한다."""
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
    """게시글 하나(작성자 이름 포함)와 댓글 목록(오래된 순, 작성자 이름 포함)을 돌려준다."""
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
    """글을 고친다. 글쓴이 본인만 할 수 있다 — 판정은 require_post_author 가 한다."""
    post = require_post_author(session, post_id, requester)
    post.title = require_non_empty(title, "제목")
    post.body = require_non_empty(body, "내용")
    session.commit()
    return post, requester.name


def require_comment_author(session: Session, comment_id: int, requester: Member) -> Comment:
    """댓글을 쓴 사람 본인이면 그 댓글을 돌려준다.

    댓글이 달린 글을 읽을 수 있는지도 함께 본다 — 팀 게시판의 댓글은 그 팀 소속만
    닿을 수 있어야 하고, 소속에서 빠진 뒤에는 자기 댓글이라도 손댈 수 없다.
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
    """댓글 하나를 만든다. 게시글이 팀 게시판 게시글이면 글쓰기와 같은 규칙으로 소속을 확인한다."""
    clean_body = require_non_empty(body, "댓글")
    require_post_readable(session, post_id, requester)

    comment = Comment(
        post_id=post_id, body=clean_body, author_id=requester.id, created_at=created_at
    )
    session.add(comment)
    session.commit()
    return comment, requester.name
