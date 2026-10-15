"""board 의 첨부 확장자 판정과 storage 의 파일명, 저장 경로 규칙을 DB 없이 검증합니다."""

from pathlib import Path

import pytest

from backend.services.board.attachment_service import _allowed_extension
from backend.services.storage.pipeline import display_name, stored_path


def test_the_extension_is_lowercased_and_checked_against_the_list() -> None:
    assert _allowed_extension("악보.PDF", frozenset({"pdf"})) == "pdf"
    with pytest.raises(ValueError, match="올릴 수 없는"):
        _allowed_extension("run.exe", frozenset({"pdf"}))


def test_a_path_in_the_name_is_removed() -> None:
    assert display_name("../../etc/passwd") == "passwd"
    assert display_name(r"C:\Users\a\b.png") == "b.png"


def test_a_stored_name_cannot_point_outside_the_folder(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ATTACHMENT_DIR", str(tmp_path))
    assert stored_path("abc.pdf") == tmp_path.resolve() / "abc.pdf"
    with pytest.raises(ValueError):
        stored_path("../outside.pdf")
