import os
import re
import secrets
import shutil
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.board_service import require_post_author, require_post_readable
from backend.db.models import Attachment, Member

# 첨부 규칙 값입니다. 다른 파일에서 다시 정하지 않습니다.
DEFAULT_STORAGE_DIR = "/var/lib/banblit/attachments"
MAX_NAME_CHARS = 200
MAX_CONTENT_TYPE_CHARS = 100
DEFAULT_CONTENT_TYPE = "application/octet-stream"

# 업로드할 수 있는 파일 확장자입니다. 이 목록에 없는 확장자는 전부 거절합니다.
ALLOWED_EXTENSIONS = frozenset(
    {
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic",
        "mp3", "wav", "m4a", "flac", "ogg", "aac",
        "mp4", "mov", "avi", "mkv", "webm",
        "md", "txt", "pdf", "doc", "docx", "ppt", "pptx",
        "hwp", "hwpx", "xls", "xlsx", "csv", "zip",
    }
)


def storage_root() -> Path:
    """파일을 저장하는 폴더를 반환합니다. ATTACHMENT_DIR 환경변수가 없으면 DEFAULT_STORAGE_DIR 을 사용합니다."""
    return Path(os.environ.get("ATTACHMENT_DIR", DEFAULT_STORAGE_DIR))


def _display_name(raw: str) -> str:
    """입력받은 파일명에서 경로 부분을 제거하고 파일명만 반환합니다.

    "../../etc/passwd" 를 입력하면 "passwd" 를 반환합니다. 이 값은 화면에 표시할 때만
    사용하고 저장 경로로는 사용하지 않습니다.
    """
    # [\\/] 는 역슬래시와 슬래시를 뜻하며, 윈도우·리눅스 두 경로 구분자를 모두 제거합니다.
    name = re.split(r"[\\/]", raw)[-1].strip()
    if not name or name in (".", ".."):
        raise ValueError("파일 이름이 없습니다")
    return name


def _allowed_extension(name: str) -> str:
    """파일명 끝의 확장자를 소문자로 반환합니다. ALLOWED_EXTENSIONS 에 없으면 ValueError 를 발생시킵니다."""
    extension = Path(name).suffix.lstrip(".").lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError(f"올릴 수 없는 파일 종류입니다: {name}")
    return extension


def _stored_path(stored_name: str) -> Path:
    """저장된 파일명을 폴더 안의 실제 경로로 변환합니다. 폴더 밖을 가리키면 ValueError 를 발생시킵니다."""
    root = storage_root().resolve()
    path = (root / stored_name).resolve()
    if not path.is_relative_to(root):
        raise ValueError("잘못된 저장 위치입니다")
    return path


def _write_stream(stream: BinaryIO, path: Path) -> int:
    """stream 을 path 에 복사하고, 쓴 바이트 수를 반환합니다.

    shutil.copyfileobj 는 조각으로 나눠 복사합니다. 파일 전체가 메모리에 올라오지 않습니다.
    복사 중 실패하면 부분적으로 쓰인 파일을 삭제하고 예외를 다시 발생시킵니다.
    """
    try:
        with path.open("wb") as target:
            shutil.copyfileobj(stream, target)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return path.stat().st_size


def save_attachment(
    session: Session,
    post_id: int,
    filename: str,
    content_type: str | None,
    stream: BinaryIO,
    requester: Member,
    uploaded_at: datetime,
) -> Attachment:
    """stream 을 디스크에 저장하고, Attachment 행을 반환합니다.

    저장된 파일명은 서버가 생성한 무작위 16바이트 hex 문자열 + 확장자입니다. 사용자가 입력한 파일명은 Attachment.name 열에
    표시 목적으로만 저장됩니다.
    """
    post = require_post_author(session, post_id, requester)
    name = _display_name(filename)
    extension = _allowed_extension(name)

    root = storage_root()
    root.mkdir(parents=True, exist_ok=True)
    stored_name = f"{secrets.token_hex(16)}.{extension}"
    size = _write_stream(stream, _stored_path(stored_name))

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
        _stored_path(stored_name).unlink(missing_ok=True)
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
    require_post_readable(session, post_id, requester)
    return attachments_of_post(session, post_id)


def _get_or_raise(session: Session, attachment_id: int) -> Attachment:
    attachment = session.get(Attachment, attachment_id)
    if attachment is None:
        raise ValueError("그런 파일이 없습니다")
    return attachment


def attachment_for_download(
    session: Session, attachment_id: int, requester: Member
) -> tuple[Attachment, Path]:
    """게시글을 읽을 수 있는 requester 에게 (Attachment 행, 디스크 경로) 튜플을 반환합니다."""
    attachment = _get_or_raise(session, attachment_id)
    require_post_readable(session, attachment.post_id, requester)
    path = _stored_path(attachment.stored_name)
    if not path.is_file():
        raise ValueError("파일을 찾을 수 없습니다")
    return attachment, path


def delete_attachment(session: Session, attachment_id: int, requester: Member) -> None:
    """게시글 작성자인 requester 가 첨부 파일 하나를 삭제합니다. 디스크의 파일과 Attachment 행을 함께 삭제합니다."""
    attachment = _get_or_raise(session, attachment_id)
    require_post_author(session, attachment.post_id, requester)
    _stored_path(attachment.stored_name).unlink(missing_ok=True)
    session.delete(attachment)
    session.commit()


def remove_post_files(session: Session, post_id: int) -> None:
    """post_id 의 게시글에 첨부된 파일을 디스크에서 전부 삭제합니다. Attachment 행은 게시글 삭제 시 cascade 로 함께 삭제됩니다."""
    stored_names = session.scalars(
        select(Attachment.stored_name).where(Attachment.post_id == post_id)
    )
    for stored_name in stored_names:
        _stored_path(stored_name).unlink(missing_ok=True)
