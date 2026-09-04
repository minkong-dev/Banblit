from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.api.board_input import require_non_empty
from backend.db.models import Comment, Member, Membership, Post, Team

PostRow = tuple[Post, str, int]
CommentRow = tuple[Comment, str]


def _require_team_exists(session: Session, team_id: int) -> None:
    if session.get(Team, team_id) is None:
        raise ValueError("그런 팀이 없습니다")


def _require_team_member(session: Session, team_id: int, member_id: int) -> None:
    # 인증된 사람이라도 그 팀 소속이 아니면 권한 문제다(PermissionError) — 팀/글이
    # 아예 없는 경우(ValueError)와는 사람이 다음에 할 일이 다르므로 구분한다.
    row = session.execute(
        select(Membership.id).where(
            Membership.team_id == team_id, Membership.member_id == member_id
        )
    ).first()
    if row is None:
        raise PermissionError("그 팀 소속이 아닙니다")


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
    """team_id 가 None 이면 공지, 아니면 그 팀 게시판 글을 최신순으로 돌려준다.

    글마다 따로 사람·댓글 수를 묻지 않고, Member 는 join 으로 한 번에 붙이고
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
    """공지사항 하나를 만든다. 글쓴이는 요청 본문이 아니라 토큰으로 확인한 requester다."""
    if requester.role != "head_manager":
        raise PermissionError("헤드매니저만 공지를 작성할 수 있습니다")
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
    """팀 게시판 글 하나를 만든다. 글쓴이는 토큰으로 확인한 requester이고, 그 팀
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
) -> tuple[Post, str, int, list[CommentRow]]:
    """글 하나(작성자 이름 포함)와 댓글 목록(오래된 순, 작성자 이름 포함)을 돌려준다.

    팀 게시판 글이면 requester가 그 팀 소속이어야 본다 — 공지(team_id 없음)는
    누구나 볼 수 있어 이 확인을 건너뛴다.
    """
    row = session.execute(
        select(Post, Member.name)
        .join(Member, Member.id == Post.author_id)
        .where(Post.id == post_id)
    ).first()
    if row is None:
        raise ValueError("그런 글이 없습니다")
    post, post_author = row
    if post.team_id is not None:
        _require_team_member(session, post.team_id, requester.id)

    comment_rows = session.execute(
        select(Comment, Member.name)
        .join(Member, Member.id == Comment.author_id)
        .where(Comment.post_id == post_id)
        .order_by(Comment.created_at, Comment.id)
    ).all()
    comments = [(comment, author) for comment, author in comment_rows]
    return post, post_author, len(comments), comments


def create_comment(
    session: Session, post_id: int, body: str, requester: Member, created_at: datetime
) -> tuple[Comment, str]:
    """댓글 하나를 만든다. 글이 팀 게시판 글이면 글쓰기와 같은 규칙으로 소속을 확인한다."""
    clean_body = require_non_empty(body, "댓글")
    post = session.get(Post, post_id)
    if post is None:
        raise ValueError("그런 글이 없습니다")
    if post.team_id is not None:
        _require_team_member(session, post.team_id, requester.id)

    comment = Comment(
        post_id=post_id, body=clean_body, author_id=requester.id, created_at=created_at
    )
    session.add(comment)
    session.commit()
    return comment, requester.name
