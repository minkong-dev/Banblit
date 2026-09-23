"""프로필 사진을 저장·삭제합니다. 계정 1개에 사진 1장입니다.

저장 폴더·조각 단위 쓰기·경로 조작 방지는 게시판 첨부(attachment_service)가 이미 하는 것을
그대로 사용합니다. 사진에만 다른 것은 두 가지입니다 — 받는 확장자를 그림으로 좁히고, 크기
상한을 파일 1개 기준으로 둡니다. 첨부는 글 1개에 붙은 합계로 제한하지만 사진은 1장뿐입니다.
"""

import secrets
from pathlib import Path
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Member
from backend.services.attachment_service import (
    display_name,
    stored_path,
    write_stream,
    storage_root,
)

# 화면이 <img> 로 표시할 수 있고, 표시해도 스크립트가 실행되지 않는 그림 형식입니다.
ALLOWED_IMAGE_TYPES: dict[str, str] = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}
# 사진 1장의 크기 상한입니다. 휴대폰으로 찍은 사진 1장이 보통 3~5MB 입니다.
MAX_AVATAR_BYTES = 5 * 1024 * 1024


def _image_extension(name: str) -> str:
    extension = Path(name).suffix.lstrip(".").lower()
    if extension not in ALLOWED_IMAGE_TYPES:
        raise ValueError("프로필 사진은 jpg·png·gif·webp 만 올릴 수 있습니다")
    return extension


def avatar_path(member: Member) -> tuple[Path, str]:
    """사진 파일의 경로와 형식을 반환합니다. 사진이 없으면 LookupError 를 발생시킵니다."""
    if not member.avatar:
        raise LookupError("프로필 사진이 없습니다")
    path = stored_path(member.avatar)
    if not path.is_file():
        # 열은 남아 있는데 파일이 사라진 경우입니다. 화면에는 사진 없음과 같게 보입니다.
        raise LookupError("프로필 사진이 없습니다")
    return path, ALLOWED_IMAGE_TYPES[member.avatar.rsplit(".", 1)[-1]]


def save_avatar(session: Session, member: Member, filename: str, stream: BinaryIO) -> None:
    """stream 을 사진으로 저장하고, 이전 사진 파일을 삭제합니다.

    저장하는 파일명은 서버가 만든 무작위 16바이트 hex 와 확장자입니다. 올린 사람이 넣은
    파일명은 저장하지 않습니다 — 사진은 이름을 표시할 일이 없습니다.
    """
    extension = _image_extension(display_name(filename))
    # 이 계정의 행을 잠그고 그 안에서 지금 사진을 읽습니다. 잠그지 않으면 같은 계정으로 거의 동시에
    # 들어온 업로드 2건이 서로의 commit 전 값을 읽어, 각자 새 파일을 남긴 채 같은 옛 파일만 지웁니다.
    # 그러면 어디에서도 참조하지 않는 파일이 디스크에 쌓입니다. attachment_service.save_attachment 가
    # 같은 방식으로 글 행을 잠급니다.
    locked = session.scalars(
        # populate_existing 이 없으면 이 session 이 앞서 읽어 둔 값을 그대로 돌려줍니다. 잠금을
        # 기다린 의미가 없어져, 기다리는 동안 다른 session 이 바꾼 파일명을 보지 못합니다.
        select(Member)
        .where(Member.id == member.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    previous = locked.avatar

    root = storage_root()
    root.mkdir(parents=True, exist_ok=True)
    stored_name = f"{secrets.token_hex(16)}.{extension}"
    write_stream(stream, stored_path(stored_name), MAX_AVATAR_BYTES)

    locked.avatar = stored_name
    try:
        session.commit()
    except BaseException:
        # 저장에 실패하면 방금 쓴 파일이 어느 행에서도 참조되지 않은 채 남습니다.
        stored_path(stored_name).unlink(missing_ok=True)
        raise
    # 새 사진을 저장한 뒤에 지웁니다. 먼저 지우면 저장에 실패했을 때 두 장 모두 없어집니다.
    if previous:
        stored_path(previous).unlink(missing_ok=True)


def delete_avatar(session: Session, member: Member) -> None:
    """사진을 삭제합니다. 사진이 없으면 아무것도 하지 않습니다."""
    # 저장과 같은 이유로 행을 잠급니다 — 올리는 요청과 지우는 요청이 겹치면 지워야 할 파일명을
    # 잘못 읽습니다.
    locked = session.scalars(
        # populate_existing 이 없으면 이 session 이 앞서 읽어 둔 값을 그대로 돌려줍니다. 잠금을
        # 기다린 의미가 없어져, 기다리는 동안 다른 session 이 바꾼 파일명을 보지 못합니다.
        select(Member)
        .where(Member.id == member.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    stored_name = locked.avatar
    if not stored_name:
        return
    locked.avatar = None
    session.commit()
    stored_path(stored_name).unlink(missing_ok=True)
