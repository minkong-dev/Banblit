# board 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api·jobs와 다른 service 모듈은 이 모듈 안의 다른 파일을 직접 import 하지 않고
# 이 파일만 참조합니다. 첨부 용량과 확장자처럼 운영자가 조절하는 값은 이 파일에만 둡니다.

from datetime import datetime
from typing import BinaryIO

from sqlalchemy.orm import Session

from backend.db.models import Attachment, Member
from backend.services.board import attachment_service
from backend.services.board.attachment_service import (
    attachment_for_download,
    attachment_for_inline,
    attachments_of_post,
    delete_attachment,
    list_attachments,
    remove_post_files,
)
from backend.services.board.board_service import (
    PostRow,
    create_comment,
    create_draft,
    create_notice,
    create_team_post,
    delete_comment,
    delete_post_row,
    get_post_with_comments,
    list_blinded_posts,
    list_notices,
    list_team_posts,
    publish_post,
    require_post_author,
    set_post_blinded,
    sweep_stale_drafts,
    update_comment,
    update_post,
)

# 글 1개에 붙은 첨부 파일 크기의 합계 상한입니다. 파일 1개의 상한은 nginx 의 client_max_body_size
# (frontend/nginx.conf.template)가 담당합니다. 합계 상한이 없으면 같은 글에 파일을 반복해서 붙여 디스크를 채울 수 있습니다.
MAX_POST_BYTES = 300 * 1024 * 1024
# 업로드할 수 있는 파일 확장자입니다. 화면 쪽 사본은 frontend/src/lib/boards.ts 의 ALLOWED_EXTENSIONS 이고,
# 파일 선택창의 accept 와 업로드 전 검증에 씁니다. 여기를 수정하면 그 사본도 같은 작업 안에서 수정합니다.
ALLOWED_EXTENSIONS = frozenset(
    {
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic",
        "mp3", "wav", "m4a", "flac", "ogg", "aac",
        "mp4", "mov", "avi", "mkv", "webm",
        "md", "txt", "pdf", "doc", "docx", "ppt", "pptx",
        "hwp", "hwpx", "xls", "xlsx", "csv", "zip",
    }
)


def save_attachment(
    session: Session,
    post_id: int,
    filename: str,
    content_type: str | None,
    stream: BinaryIO,
    requester: Member,
    uploaded_at: datetime,
) -> Attachment:
    return attachment_service.save_attachment(
        session, post_id, filename, content_type, stream, requester, uploaded_at, MAX_POST_BYTES, ALLOWED_EXTENSIONS
    )


def delete_post(session: Session, post_id: int, requester: Member) -> None:
    """작성자나 board_moderate 권한자가 글을 삭제합니다. 첨부 파일도 디스크에서 삭제합니다."""
    post = require_post_author(session, post_id, requester)
    # 행을 삭제하기 전에 디스크의 파일부터 삭제합니다. 순서를 바꾸면 어느 파일이 이 글의 파일이었는지
    # 조회할 수 없게 되어, 아무도 삭제하지 못하는 파일이 남습니다.
    remove_post_files(session, post_id)
    delete_post_row(session, post)


__all__ = [
    "ALLOWED_EXTENSIONS",
    "MAX_POST_BYTES",
    "delete_post",
    "attachment_for_download",
    "attachment_for_inline",
    "attachments_of_post",
    "delete_attachment",
    "list_attachments",
    "remove_post_files",
    "save_attachment",
    "PostRow",
    "create_comment",
    "create_draft",
    "create_notice",
    "create_team_post",
    "delete_comment",
    "get_post_with_comments",
    "list_blinded_posts",
    "list_notices",
    "list_team_posts",
    "publish_post",
    "require_post_author",
    "set_post_blinded",
    "sweep_stale_drafts",
    "update_comment",
    "update_post",
]
