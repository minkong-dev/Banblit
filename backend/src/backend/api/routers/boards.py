from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.services.attachment_service import (
    attachment_for_download,
    attachment_for_inline,
    attachments_of_post,
    delete_attachment,
    list_attachments,
    remove_post_files,
    save_attachment,
)
from backend.api.auth_dependency import require_account, require_permission
from backend.services.input import format_created_at
from backend.services.board_service import (
    PostRow,
    create_comment,
    create_draft,
    create_notice,
    create_team_post,
    delete_comment,
    get_post_with_comments,
    list_blinded_posts,
    list_notices,
    list_team_posts,
    publish_post,
    require_post_author,
    set_post_blinded,
    update_comment,
    update_post,
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


def _post_out(
    post: Post, author: str, comment_count: int, blinded_by: str | None = None
) -> PostOut:
    return PostOut(
        id=post.id,
        team_id=post.team_id,
        title=post.title,
        body=post.body,
        author_id=post.author_id,
        author=author,
        created_at=format_created_at(post.created_at),
        comment_count=comment_count,
        blinded_by=blinded_by,
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
    return PostsOut(
        posts=[
            _post_out(post, author, count, blinded_by)
            for post, author, count, blinded_by in rows
        ]
    )


# 공지의 "전체 공개"는 팀을 구분하지 않는다는 뜻이지 로그인하지 않은 방문자에게 공개한다는 뜻이 아닙니다.
# 목록이 표시되는 화면이 로그인 후의 메인 캘린더이므로, 사용자 신원은 확인하지 않고 로그인만 검증합니다.
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
    post, author = create_notice(session, req.title, req.body, requester, datetime.now())
    return PostEnvelopeOut(post=_post_out(post, author, 0))


# 작성 페이지를 열 때 호출합니다. 빈 글을 먼저 만들어야 본문에 파일을 넣을 수 있습니다
# (첨부 업로드가 POST /posts/{id}/attachments 라 글 번호가 필요합니다).
@router.post("/notices/drafts", response_model=PostEnvelopeOut, status_code=201)
def start_notice_draft(
    requester: Member = Depends(require_permission("notice_write")),
    session: Session = Depends(get_session),
) -> PostEnvelopeOut:
    post = create_draft(session, None, requester, datetime.now())
    return PostEnvelopeOut(post=_post_out(post, requester.name, 0, None))


@router.post(
    "/teams/{team_id}/posts/drafts", response_model=PostEnvelopeOut, status_code=201
)
def start_team_post_draft(
    team_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostEnvelopeOut:
    # ValueError 와 PermissionError 는 app.py 의 전역 처리기가 422·403 으로 변환합니다.
    post = create_draft(session, team_id, requester, datetime.now())
    return PostEnvelopeOut(post=_post_out(post, requester.name, 0, None))


# 초안에 제목과 본문을 채워 발행합니다. 이 시점부터 목록에 나옵니다.
@router.post("/posts/{post_id}/publish", response_model=PostEnvelopeOut)
def publish(
    post_id: int,
    req: PostCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostEnvelopeOut:
    post, author = publish_post(
        session, post_id, req.title, req.body, requester, datetime.now()
    )
    return PostEnvelopeOut(post=_post_out(post, author, 0, None))


# 블라인드는 글을 삭제하지 않고 목록·상세에서 가립니다. 작성자 본인에게도 보이지 않습니다.
# 아래 세 endpoint 는 board_moderate 를 가진 사람만 호출합니다.
@router.get("/blinded-posts", response_model=PostsOut)
def read_blinded_posts(
    _: Member = Depends(require_permission("board_moderate")),
    session: Session = Depends(get_session),
) -> PostsOut:
    return _posts_out(list_blinded_posts(session))


@router.put("/posts/{post_id}/blind", status_code=204)
def blind_post(
    post_id: int,
    requester: Member = Depends(require_permission("board_moderate")),
    session: Session = Depends(get_session),
) -> None:
    set_post_blinded(session, post_id, datetime.now(), requester)


@router.delete("/posts/{post_id}/blind", status_code=204)
def unblind_post(
    post_id: int,
    requester: Member = Depends(require_permission("board_moderate")),
    session: Session = Depends(get_session),
) -> None:
    set_post_blinded(session, post_id, None, requester)


@router.get("/teams/{team_id}/posts", response_model=PostsOut)
def read_team_posts(
    team_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostsOut:
    rows = list_team_posts(session, team_id, requester)
    return _posts_out(rows)


@router.post("/teams/{team_id}/posts", response_model=PostEnvelopeOut, status_code=201)
def create_team_post_endpoint(
    team_id: int,
    req: PostCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostEnvelopeOut:
    post, author = create_team_post(
        session, team_id, req.title, req.body, requester, datetime.now()
    )
    return PostEnvelopeOut(post=_post_out(post, author, 0))


@router.get("/posts/{post_id}", response_model=PostDetailOut)
def read_post_detail(
    post_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostDetailOut:
    post, author, comment_rows = get_post_with_comments(
        session, post_id, requester
    )
    return PostDetailOut(
        post=_post_out(post, author, len(comment_rows)),
        comments=[_comment_out(comment, author) for comment, author in comment_rows],
        # 열람 권한은 위의 get_post_with_comments 가 이미 검증했습니다. 이 함수에서 다시
        # 검증하면 같은 팀 소속 조회가 한 요청에 2번 실행됩니다.
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
    comment, author = create_comment(session, post_id, req.body, requester, datetime.now())
    return CommentEnvelopeOut(comment=_comment_out(comment, author))


@router.patch("/posts/{post_id}", response_model=PostEnvelopeOut)
def edit_post(
    post_id: int,
    # 생성 시와 수정 시 받는 항목·길이 제한이 같아 같은 schema를 사용합니다.
    req: PostCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> PostEnvelopeOut:
    post, author = update_post(session, post_id, req.title, req.body, requester)
    return PostEnvelopeOut(post=_post_out(post, author, 0))


@router.patch("/comments/{comment_id}", response_model=CommentEnvelopeOut)
def edit_comment(
    comment_id: int,
    req: CommentCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> CommentEnvelopeOut:
    comment, author = update_comment(session, comment_id, req.body, requester)
    return CommentEnvelopeOut(comment=_comment_out(comment, author))


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment_endpoint(
    comment_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    delete_comment(session, comment_id, requester)


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
    # file.file은 framework가 이미 임시 파일로 준비한 파일 객체입니다. 서비스에는
    # UploadFile이 아니라 읽을 수 있는 객체만 전달합니다 — 서비스가 endpoint(API의 요청 주소 단위) 형식을 모르게 둡니다.
    # 파일 크기 상한 검사를 이 함수에 두지 않습니다. 이 함수에 도달하기 전에 nginx 의
    # client_max_body_size(frontend/nginx.conf.template)가 이미 거부했습니다.
    attachment = save_attachment(
        session,
        post_id,
        file.filename or "",
        file.content_type,
        file.file,
        requester,
        datetime.now(),
    )
    return AttachmentEnvelopeOut(attachment=_attachment_out(attachment))


@router.get("/posts/{post_id}/attachments", response_model=AttachmentsOut)
def read_attachments(
    post_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> AttachmentsOut:
    rows = list_attachments(session, post_id, requester)
    return AttachmentsOut(attachments=[_attachment_out(row) for row in rows])


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> FileResponse:
    attachment, path = attachment_for_download(session, attachment_id, requester)
    # filename을 지정하면 FileResponse가 Content-Disposition: attachment를 설정합니다 —
    # 브라우저가 내용을 표시하지 않고 다운로드합니다. media_type을 octet-stream으로 설정하고
    # X-Content-Type-Options: nosniff를 붙여, 브라우저가 파일 내용을 보고 종류를 재결정하지 못하게 합니다.
    return FileResponse(
        path,
        filename=attachment.name,
        media_type="application/octet-stream",
        headers={"X-Content-Type-Options": "nosniff"},
    )


# 본문에 넣은 그림·소리·PDF 를 브라우저가 표시하는 경로입니다. 위 다운로드 경로는 모든 파일을
# octet-stream 과 Content-Disposition: attachment 로 내보내므로 img·audio·iframe 이 표시하지
# 못합니다. 표시해도 스크립트가 실행되지 않는 확장자만 INLINE_TYPES 가 허용하고, 그 밖의 형식은
# 415 로 거절해 다운로드 경로만 남깁니다. nosniff 는 그대로 붙여 브라우저가 형식을 다시 정하지 못하게 합니다.
@router.get("/attachments/{attachment_id}/inline")
def view_attachment(
    attachment_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> FileResponse:
    try:
        _, path, content_type = attachment_for_inline(session, attachment_id, requester)
    except LookupError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    return FileResponse(
        path,
        media_type=content_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            # 이 응답 문서가 다른 자원을 불러오지 못하게 막습니다. sandbox 토큰은 넣지 않습니다 —
            # 브라우저 내장 PDF 뷰어가 동작하지 않습니다. object-src 는 그 뷰어에 필요합니다.
            # frame-ancestors 는 외부 사이트가 이 응답을 자기 페이지의 frame 에 끼워 넣는 것을 막습니다.
            "Content-Security-Policy": "default-src 'none'; object-src 'self'; img-src 'self'; frame-ancestors 'self'",
        },
    )


@router.delete("/attachments/{attachment_id}", status_code=204)
def delete_attachment_endpoint(
    attachment_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    delete_attachment(session, attachment_id, requester)


@router.delete("/posts/{post_id}", status_code=204)
def delete_post_endpoint(
    post_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    post = require_post_author(session, post_id, requester)
    # attachments table 의 행이 삭제되기 전에 디스크의 파일부터 삭제합니다. 순서를 변경하면
    # 어느 파일이 이 게시글의 파일이었는지 추적할 수 없게 되어, 아무도 삭제하지 못하는 파일이 남습니다.
    remove_post_files(session, post_id)
    session.delete(post)
    session.commit()
