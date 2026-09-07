from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.api.attachment_service import (
    attachment_for_download,
    attachments_of_post,
    delete_attachment,
    list_attachments,
    remove_post_files,
    save_attachment,
)
from backend.api.auth_dependency import require_account, require_permission
from backend.api.board_input import format_created_at
from backend.api.board_service import (
    PostRow,
    create_comment,
    create_notice,
    create_team_post,
    get_post_with_comments,
    list_notices,
    list_team_posts,
    require_post_author,
)
from backend.api.schemas import (
    AttachmentEnvelopeOut,
    AttachmentOut,
    AttachmentsOut,
    CommentCreateIn,
    CommentEnvelopeOut,
    CommentOut,
    PostCreateIn,
    PostDetailOut,
    PostEnvelopeOut,
    PostOut,
    PostsOut,
)
from backend.db.models import Attachment, Comment, Member, Post
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


def _attachment_out(attachment: Attachment) -> AttachmentOut:
    return AttachmentOut(
        id=attachment.id,
        post_id=attachment.post_id,
        name=attachment.name,
        size=attachment.size,
        content_type=attachment.content_type,
        uploaded_at=format_created_at(attachment.uploaded_at),
    )


def _posts_out(rows: list[PostRow]) -> PostsOut:
    return PostsOut(posts=[_post_out(post, author, count) for post, author, count in rows])


# 공지의 "전체 공개"는 팀을 가리지 않는다는 뜻이지 방문자에게 연다는 뜻이 아니다.
# 목록이 놓인 자리가 로그인 뒤의 메인 캘린더라, 누구인지는 쓰지 않고 로그인만 본다.
@router.get(
    "/notices", response_model=PostsOut, dependencies=[Depends(require_account)]
)
def read_notices(session: Session = Depends(get_session)) -> PostsOut:
    return _posts_out(list_notices(session))


@router.post("/notices", response_model=PostEnvelopeOut, status_code=201)
def create_notice_post(
    req: PostCreateIn,
    requester: Member = Depends(require_permission("notice_write")),
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
        # 볼 자격은 바로 위 get_post_with_comments 가 이미 확인했다. 여기서 다시
        # 확인하는 함수를 쓰면 같은 소속 조회가 한 요청에 두 번 돈다.
        attachments=[_attachment_out(row) for row in attachments_of_post(session, post.id)],
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


@router.post(
    "/posts/{post_id}/attachments",
    response_model=AttachmentEnvelopeOut,
    status_code=201,
)
def upload_attachment(
    post_id: int,
    file: UploadFile = File(),
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> AttachmentEnvelopeOut:
    try:
        # file.file 은 프레임워크가 이미 임시 파일로 받아 둔 것을 가리킨다. 서비스에는
        # UploadFile 이 아니라 읽을 수 있는 것만 넘긴다 — 서비스가 통로 형식을 모르게 둔다.
        # 크기 상한 검사를 여기 두지 않는다. 이 함수에 닿기 전에 앞단 nginx 의
        # client_max_body_size(frontend/nginx.conf.template)가 이미 거절한다.
        attachment = save_attachment(
            session,
            post_id,
            file.filename or "",
            file.content_type,
            file.file,
            requester,
            datetime.now(),
        )
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return AttachmentEnvelopeOut(attachment=_attachment_out(attachment))


@router.get("/posts/{post_id}/attachments", response_model=AttachmentsOut)
def read_attachments(
    post_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> AttachmentsOut:
    try:
        rows = list_attachments(session, post_id, requester)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return AttachmentsOut(attachments=[_attachment_out(row) for row in rows])


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> FileResponse:
    try:
        attachment, path = attachment_for_download(session, attachment_id, requester)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    # filename 을 주면 FileResponse 가 Content-Disposition: attachment 를 붙인다 —
    # 브라우저가 내용을 열지 않고 받는다. 종류도 octet-stream 하나로 내려 보내고
    # nosniff 를 붙여, 브라우저가 내용을 보고 종류를 다시 정하지 못하게 한다.
    return FileResponse(
        path,
        filename=attachment.name,
        media_type="application/octet-stream",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
def delete_attachment_endpoint(
    attachment_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    try:
        delete_attachment(session, attachment_id, requester)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/posts/{post_id}", status_code=204)
def delete_post_endpoint(
    post_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    try:
        post = require_post_author(session, post_id, requester)
        # 표의 행이 사라지기 전에 디스크의 파일부터 지운다. 순서를 바꾸면 어느 파일이
        # 이 글의 것이었는지 알 방법이 없어져, 아무도 못 지우는 파일이 남는다.
        remove_post_files(session, post_id)
        session.delete(post)
        session.commit()
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
