from datetime import date, time

import pytest

from backend.api.period_crud_input import (
    format_calendar_date,
    format_clock,
    parse_calendar_date,
    parse_clock,
    require_ends_not_before_starts,
    require_valid_kind,
)


def test_parse_clock_reads_hour_and_minute() -> None:
    assert parse_clock("09:00", "1차 연산 시각") == time(9, 0)


def test_parse_clock_rejects_bad_format() -> None:
    with pytest.raises(ValueError, match="1차 연산 시각"):
        parse_clock("아침 9시", "1차 연산 시각")


def test_parse_clock_does_not_require_a_half_hour_grid() -> None:
    # 자동 연산 시각은 격자 제약이 없다 — 09:17 같은 값도 받아들여야 한다.
    assert parse_clock("09:17", "1차 연산 시각") == time(9, 17)


def test_format_clock_writes_hh_mm() -> None:
    assert format_clock(time(21, 0)) == "21:00"


def test_parse_calendar_date_reads_iso_date() -> None:
    assert parse_calendar_date("2026-09-14", "시작일") == date(2026, 9, 14)


def test_parse_calendar_date_rejects_bad_format() -> None:
    with pytest.raises(ValueError, match="시작일"):
        parse_calendar_date("2026/09/14", "시작일")


def test_format_calendar_date_writes_iso() -> None:
    assert format_calendar_date(date(2026, 9, 27)) == "2026-09-27"


def test_valid_kind_accepts_open_and_focused() -> None:
    require_valid_kind("open")
    require_valid_kind("focused")


def test_valid_kind_rejects_anything_else() -> None:
    with pytest.raises(ValueError, match="kind"):
        require_valid_kind("party")


def test_ends_on_before_starts_on_is_rejected() -> None:
    with pytest.raises(ValueError, match="종료일"):
        require_ends_not_before_starts(date(2026, 9, 14), date(2026, 9, 13))


def test_ends_on_equal_to_starts_on_is_accepted() -> None:
    require_ends_not_before_starts(date(2026, 9, 14), date(2026, 9, 14))
