import pytest

from backend.api.board_input import format_created_at, require_non_empty


def test_require_non_empty_trims_surrounding_whitespace() -> None:
    assert require_non_empty("  안녕하세요  ", "제목") == "안녕하세요"


def test_require_non_empty_rejects_an_empty_string() -> None:
    with pytest.raises(ValueError, match="제목"):
        require_non_empty("", "제목")


def test_require_non_empty_rejects_a_whitespace_only_string() -> None:
    with pytest.raises(ValueError, match="내용"):
        require_non_empty("   ", "내용")


def test_format_created_at_writes_seconds_without_microseconds() -> None:
    from datetime import datetime

    value = datetime(2026, 9, 4, 14, 30, 0, 123456)

    assert format_created_at(value) == "2026-09-04T14:30:00"
