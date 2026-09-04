from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.api.board_input import format_created_at
from backend.api.board_service import (
    PostRow,
    create_comment,
    create_notice,
    create_team_post,
    get_post_with_comments,
    list_notices,
    list_team_posts,
)
from backend.api.schemas import (
    CommentCreateIn,
    CommentEnvelopeOut,
    CommentOut,
    PostCreateIn,
    PostDetailOut,
    PostEnvelopeOut,
    PostOut,
    PostsOut,
)
from backend.db.models import Comment, Member, Post
from backend.db.pipeline import get_session

router = APIRouter()


def _post_out(post: Post, author: str, comment_count: int) -> PostOut:
    return PostOut(
        id=post.id,
        team_id=post.team_id,
        title=post.title,
        body=post.body,
        author_id=post.author_id,
        author=author,
        created_at=format_created_at(post.created_at),
        comment_count=comment_count,
    )


def _comment_out(comment: Comment, author: str) -> CommentOut:
    return CommentOut(
        id=comment.id,
        post_id=comment.post_id,
        body=comment.body,
        author_id=comment.author_id,
        author=author,
        created_at=format_created_at(comment.created_at),
    )


def _posts_out(rows: list[PostRow]) -> PostsOut:
    return PostsOut(posts=[_post_out(post, author, count) for post, author, count in rows])


@router.get("/notices", response_model=PostsOut)
def read_notices(session: Session = Depends(get_session)) -> PostsOut:
    return _posts_out(list_notices(session))


@router.post("/notices", response_model=PostEnvelopeOut, status_code=201)
def create_notice_post(
    req: PostCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostEnvelopeOut:
    try:
        post, author = create_notice(session, req.title, req.body, requester, datetime.now())
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return PostEnvelopeOut(post=_post_out(post, author, 0))


@router.get("/teams/{team_id}/posts", response_model=PostsOut)
def read_team_posts(
    team_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostsOut:
    try:
        rows = list_team_posts(session, team_id, requester)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _posts_out(rows)


@router.post("/teams/{team_id}/posts", response_model=PostEnvelopeOut, status_code=201)
def create_team_post_endpoint(
    team_id: int,
    req: PostCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostEnvelopeOut:
    try:
        post, author = create_team_post(
            session, team_id, req.title, req.body, requester, datetime.now()
        )
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return PostEnvelopeOut(post=_post_out(post, author, 0))


@router.get("/posts/{post_id}", response_model=PostDetailOut)
def read_post_detail(
    post_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostDetailOut:
    try:
        post, author, comment_count, comment_rows = get_post_with_comments(
            session, post_id, requester
        )
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return PostDetailOut(
        post=_post_out(post, author, comment_count),
        comments=[_comment_out(comment, author) for comment, author in comment_rows],
    )


@router.post(
    "/posts/{post_id}/comments", response_model=CommentEnvelopeOut, status_code=201
)
def create_post_comment(
    post_id: int,
    req: CommentCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> CommentEnvelopeOut:
    try:
        comment, author = create_comment(session, post_id, req.body, requester, datetime.now())
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return CommentEnvelopeOut(comment=_comment_out(comment, author))
