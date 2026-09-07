import os
import re
import secrets
import shutil
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.board_service import require_post_author, require_post_readable
from backend.db.models import Attachment, Member

# 첨부 규칙 값. 다른 파일에서 다시 정하지 않는다.
DEFAULT_STORAGE_DIR = "/var/lib/banblit/attachments"
MAX_NAME_CHARS = 200
MAX_CONTENT_TYPE_CHARS = 100
DEFAULT_CONTENT_TYPE = "application/octet-stream"

# 올릴 수 있는 확장자. 이 목록에 없는 것은 전부 거절한다.
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
    """파일을 두는 폴더를 돌려준다. ATTACHMENT_DIR 이 없으면 기본 위치를 쓴다."""
    return Path(os.environ.get("ATTACHMENT_DIR", DEFAULT_STORAGE_DIR))


def _display_name(raw: str) -> str:
    """보낸 이름에서 폴더 부분을 떼고 파일 이름만 돌려준다.

    "../../etc/passwd" 를 넣으면 "passwd" 가 나온다. 이 값은 화면에 보여줄 때만
    쓰고 저장 경로로는 쓰지 않는다.
    """
    # [\\/] 는 역슬래시 하나와 슬래시 하나를 뜻한다 — 윈도우·리눅스 두 구분자를 모두 자른다.
    name = re.split(r"[\\/]", raw)[-1].strip()
    if not name or name in (".", ".."):
        raise ValueError("파일 이름이 없습니다")
    return name


def _allowed_extension(name: str) -> str:
    """이름 끝의 확장자를 소문자로 돌려준다. 허용 목록에 없으면 거절한다."""
    extension = Path(name).suffix.lstrip(".").lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValueError(f"올릴 수 없는 파일 종류입니다: {name}")
    return extension


def _stored_path(stored_name: str) -> Path:
    """저장 이름을 폴더 안의 실제 경로로 바꾼다. 폴더 밖을 가리키면 거절한다."""
    root = storage_root().resolve()
    path = (root / stored_name).resolve()
    if not path.is_relative_to(root):
        raise ValueError("잘못된 저장 위치입니다")
    return path


def _write_stream(stream: BinaryIO, path: Path) -> int:
    """stream 을 path 에 옮겨 쓰고, 쓴 바이트 수를 돌려준다.

    copyfileobj 는 조각으로 나눠 옮긴다 — 파일 전체가 메모리에 올라오지 않는다.
    쓰다가 실패하면 반쯤 쓴 파일을 지우고 그 예외를 그대로 올린다.
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
    """stream 을 디스크에 옮겨 담고, 그 자리를 가리키는 행 하나를 돌려준다.

    저장 이름은 서버가 만든 무작위 16바이트 글자 + 확장자다. 보낸 이름은 name 열에
    보여줄 값으로만 남는다.
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
        # 커밋이 실패하면 방금 쓴 파일도 지우고 그 예외를 그대로 올린다.
        _stored_path(stored_name).unlink(missing_ok=True)
        raise
    return attachment


def attachments_of_post(session: Session, post_id: int) -> list[Attachment]:
    """글에 붙은 파일 목록을 올린 순서대로 돌려준다. 볼 자격은 부르는 쪽이 확인한다."""
    return list(
        session.scalars(
            select(Attachment).where(Attachment.post_id == post_id).order_by(Attachment.id)
        )
    )


def list_attachments(
    session: Session, post_id: int, requester: Member
) -> list[Attachment]:
    """글을 읽을 수 있는 사람에게 그 글의 파일 목록을 돌려준다."""
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
    """글을 읽을 수 있는 사람에게 (행, 디스크 경로)를 돌려준다."""
    attachment = _get_or_raise(session, attachment_id)
    require_post_readable(session, attachment.post_id, requester)
    path = _stored_path(attachment.stored_name)
    if not path.is_file():
        raise ValueError("파일을 찾을 수 없습니다")
    return attachment, path


def delete_attachment(session: Session, attachment_id: int, requester: Member) -> None:
    """글쓴이가 파일 하나를 지운다. 디스크의 파일과 표의 행을 함께 지운다."""
    attachment = _get_or_raise(session, attachment_id)
    require_post_author(session, attachment.post_id, requester)
    _stored_path(attachment.stored_name).unlink(missing_ok=True)
    session.delete(attachment)
    session.commit()


def remove_post_files(session: Session, post_id: int) -> None:
    """글에 붙은 파일을 디스크에서 전부 지운다. 표의 행은 글이 지워질 때 함께 사라진다."""
    stored_names = session.scalars(
        select(Attachment.stored_name).where(Attachment.post_id == post_id)
    )
    for stored_name in stored_names:
        _stored_path(stored_name).unlink(missing_ok=True)
