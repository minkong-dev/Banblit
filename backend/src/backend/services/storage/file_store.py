"""업로드 파일을 디스크에 저장합니다.

저장 폴더, 경로 조작 방지, 조각 단위 쓰기만 담당합니다. 받는 확장자와 크기 상한은 호출자가 지정합니다.
"""

import os
import re
from pathlib import Path
from typing import BinaryIO

DEFAULT_STORAGE_DIR = "/var/lib/banblit/attachments"
# 한 번에 읽어 디스크에 쓰는 조각의 크기입니다. 파일 전체가 메모리에 올라오지 않게 합니다.
_CHUNK_BYTES = 64 * 1024


def storage_root() -> Path:
    """파일을 저장하는 폴더를 반환합니다. ATTACHMENT_DIR 환경변수가 없으면 DEFAULT_STORAGE_DIR 을 사용합니다."""
    return Path(os.environ.get("ATTACHMENT_DIR", DEFAULT_STORAGE_DIR))


def display_name(raw: str) -> str:
    """입력받은 파일명에서 경로 부분을 제거하고 파일명만 반환합니다.

    "../../etc/passwd" 를 입력하면 "passwd" 를 반환합니다. 이 값은 화면에 표시할 때만
    사용하고 저장 경로로는 사용하지 않습니다.
    """
    # [\\/] 는 역슬래시와 슬래시를 뜻하며, Windows 와 Linux 의 경로 구분자를 모두 제거합니다.
    name = re.split(r"[\\/]", raw)[-1].strip()
    if not name or name in (".", ".."):
        raise ValueError("파일 이름이 존재하지 않아요")
    return name


def stored_path(stored_name: str) -> Path:
    """저장된 파일명을 폴더 안의 실제 경로로 변환합니다. 폴더 밖을 가리키면 ValueError 를 발생시킵니다."""
    root = storage_root().resolve()
    path = (root / stored_name).resolve()
    if not path.is_relative_to(root):
        raise ValueError("잘못된 저장 위치예요")
    return path




def write_stream(stream: BinaryIO, path: Path, limit: int, too_large: str) -> int:
    """stream 을 path 에 복사하고, 쓴 바이트 수를 반환합니다.

    조각으로 나눠 복사하므로 파일 전체가 메모리에 올라오지 않습니다. 쓴 양이 limit 을 초과하면
    복사를 중단하고 too_large 문구로 ValueError 를 발생시킵니다. 전부 쓴 뒤에 판정하면 거절할 파일도 디스크에
    전부 쓰게 됩니다.

    복사 중 예외가 발생하면 부분적으로 쓰인 파일을 삭제하고 예외를 다시 발생시킵니다.
    """
    written = 0
    try:
        with path.open("wb") as target:
            while chunk := stream.read(_CHUNK_BYTES):
                written += len(chunk)
                if written > limit:
                    raise ValueError(too_large)
                target.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return written
