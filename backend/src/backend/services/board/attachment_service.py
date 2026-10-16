import secrets
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.services.board.board_service import require_post_author, require_post_readable
from backend.services.storage.pipeline import display_name, storage_root, stored_path, write_stream
from backend.db.models import Attachment, Member, Post

# 첨부 규칙 값입니다. 다른 파일에서 다시 정의하지 않습니다.
MAX_NAME_CHARS = 200
MAX_CONTENT_TYPE_CHARS = 100
DEFAULT_CONTENT_TYPE = "application/octet-stream"



def _allowed_extension(name: str, allowed: frozenset[str]) -> str:
    """파일명 끝의 확장자를 소문자로 반환합니다. allowed 에 없으면 ValueError 를 발생시킵니다."""
    extension = Path(name).suffix.lstrip(".").lower()
    if extension not in allowed:
        raise ValueError(f"올릴 수 없는 파일 종류예요: {name}")
    return extension


def _used_bytes(session: Session, post_id: int) -> int:
    """post_id 의 게시글에 이미 붙어 있는 첨부 파일 크기의 합계를 반환합니다. 첨부가 없으면 0 을 반환합니다."""
    total = session.scalar(
        select(func.coalesce(func.sum(Attachment.size), 0)).where(
            Attachment.post_id == post_id
        )
    )
    return int(total or 0)


def save_attachment(
    session: Session,
    post_id: int,
    filename: str,
    content_type: str | None,
    stream: BinaryIO,
    requester: Member,
    uploaded_at: datetime,
    max_post_bytes: int,
    allowed_extensions: frozenset[str],
) -> Attachment:
    """stream 을 디스크에 저장하고, Attachment 행을 반환합니다. 확장자가 allowed_extensions 에 없거나
    글 1개의 첨부 합계가 max_post_bytes 를 넘으면 ValueError 를 발생시킵니다.

    저장된 파일명은 서버가 생성한 무작위 16바이트 hex 문자열 + 확장자입니다. 사용자가 입력한 파일명은 Attachment.name 열에
    표시 목적으로만 저장됩니다.
    """
    # 댓글에 넣은 사진도 그 글의 attachment 로 올라가므로, 업로드 조건을 댓글 작성과 같은
    # require_post_readable 로 둡니다. 글쓴이만 허용하면 댓글은 쓸 수 있는데 사진은 넣을 수 없습니다.
    # board_moderate 권한은 팀 소속을 확인하지 않으므로 업로드 조건에 넣지 않습니다. 넣으면 어느 팀의 글에도 첨부할 수 있습니다.
    post = require_post_readable(session, post_id, requester)
    name = display_name(filename)
    extension = _allowed_extension(name, allowed_extensions)

    root = storage_root()
    root.mkdir(parents=True, exist_ok=True)
    stored_name = f"{secrets.token_hex(16)}.{extension}"
    # 합계를 조회하기 전에 그 글의 행을 잠급니다. 잠그지 않으면 같은 글에 동시에 들어온 업로드 2건이
    # 서로의 commit 전 합계를 읽어, 2건 모두 max_post_bytes 만큼 저장합니다. 같은 방식의 잠금을
    # reservation_service.py 의 _get_own_reservation 이 사용합니다.
    session.scalars(select(Post).where(Post.id == post.id).with_for_update()).one()
    remaining = max_post_bytes - _used_bytes(session, post.id)
    size = write_stream(stream, stored_path(stored_name), remaining, "이 글의 첨부 파일 크기 합계가 상한을 초과했어요")

    attachment = Attachment(
        post_id=post.id,
        name=name[:MAX_NAME_CHARS],
        stored_name=stored_name,
        size=size,
        content_type=(content_type or DEFAULT_CONTENT_TYPE)[:MAX_CONTENT_TYPE_CHARS],
        uploaded_at=uploaded_at,
    )
    session.add(attachment)
    try:
        session.commit()
    except BaseException:
        # 커밋이 실패하면 방금 저장한 파일도 삭제하고 예외를 다시 발생시킵니다.
        stored_path(stored_name).unlink(missing_ok=True)
        raise
    return attachment


def attachments_of_post(session: Session, post_id: int) -> list[Attachment]:
    """post_id 의 게시글에 첨부된 파일 목록을 업로드된 순서대로 반환합니다. 접근 권한 확인은 호출자가 수행합니다."""
    return list(
        session.scalars(
            select(Attachment).where(Attachment.post_id == post_id).order_by(Attachment.id)
        )
    )


def list_attachments(
    session: Session, post_id: int, requester: Member
) -> list[Attachment]:
    """게시글을 읽을 수 있는 requester 에게 그 게시글의 첨부 파일 목록을 반환합니다."""
    require_post_readable(session, post_id, requester, any_team=True)
    return attachments_of_post(session, post_id)


def _get_or_raise(session: Session, attachment_id: int) -> Attachment:
    attachment = session.get(Attachment, attachment_id)
    if attachment is None:
        raise ValueError("존재하지 않는 파일이에요")
    return attachment


def attachment_for_download(
    session: Session, attachment_id: int, requester: Member
) -> tuple[Attachment, Path]:
    """게시글을 읽을 수 있는 requester 에게 (Attachment 행, 디스크 경로) 튜플을 반환합니다."""
    attachment = _get_or_raise(session, attachment_id)
    require_post_readable(session, attachment.post_id, requester, any_team=True)
    path = stored_path(attachment.stored_name)
    if not path.is_file():
        raise ValueError("파일을 찾을 수 없어요")
    return attachment, path


# 본문에 넣은 첨부를 브라우저가 표시할 때 사용하는 content type 입니다. 확장자로만 판정합니다 —
# 업로드할 때 받은 MIME 은 보내는 쪽이 정하는 값이라 믿지 않습니다.
# HTML·SVG·XML 은 넣지 않습니다. 그 안의 스크립트가 이 서비스 화면의 권한으로 실행됩니다.
# 이 목록은 inline endpoint 가 내보낼 수 있는 형식이고, 화면 editor 가 본문에 넣는 형식 목록과는 다릅니다.
# flac 은 Safari 가 재생하지 못해 화면 쪽(frontend/src/lib/richText.ts 의 AUDIO)에서 의도적으로 제외합니다.
INLINE_TYPES: dict[str, str] = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
    "mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4",
    "ogg": "audio/ogg", "aac": "audio/aac", "flac": "audio/flac",
    "pdf": "application/pdf",
}


def attachment_for_inline(
    session: Session, attachment_id: int, requester: Member
) -> tuple[Attachment, Path, str]:
    """게시글을 읽을 수 있는 requester 에게 (Attachment 행, 디스크 경로, content type) 을 반환합니다.

    INLINE_TYPES 에 없는 확장자는 LookupError 를 발생시킵니다. 표시할 수단이 없거나, 표시하면
    그 안의 스크립트가 실행될 수 있는 형식입니다.
    """
    attachment, path = attachment_for_download(session, attachment_id, requester)
    extension = attachment.stored_name.rsplit(".", 1)[-1].lower()
    content_type = INLINE_TYPES.get(extension)
    if content_type is None:
        raise LookupError("본문에 표시할 수 없는 형식이에요")
    return attachment, path, content_type


def delete_attachment(session: Session, attachment_id: int, requester: Member) -> None:
    """게시글 작성자인 requester 가 첨부 파일 하나를 삭제합니다. 디스크의 파일과 Attachment 행을 함께 삭제합니다."""
    attachment = _get_or_raise(session, attachment_id)
    require_post_author(session, attachment.post_id, requester)
    stored_path(attachment.stored_name).unlink(missing_ok=True)
    session.delete(attachment)
    session.commit()


def remove_post_files(session: Session, post_id: int) -> None:
    """post_id 의 게시글에 첨부된 파일을 디스크에서 전부 삭제합니다. Attachment 행은 게시글 삭제 시 cascade 로 함께 삭제됩니다."""
    stored_names = session.scalars(
        select(Attachment.stored_name).where(Attachment.post_id == post_id)
    )
    for stored_name in stored_names:
        stored_path(stored_name).unlink(missing_ok=True)
