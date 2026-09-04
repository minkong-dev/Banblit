from datetime import time

import pytest

from backend.api.room_input import (
    format_clock,
    parse_clock,
    require_closes_after_opens,
    require_half_hour_grid,
    require_room_name,
)


def test_parse_clock_reads_hour_and_minute() -> None:
    assert parse_clock("18:30", "여는 시각") == time(18, 30)


def test_parse_clock_rejects_bad_format() -> None:
    with pytest.raises(ValueError, match="여는 시각"):
        parse_clock("18시30분", "여는 시각")


def test_format_clock_writes_hh_mm() -> None:
    assert format_clock(time(9, 0)) == "09:00"


def test_half_hour_grid_accepts_on_grid_minutes() -> None:
    require_half_hour_grid(time(18, 0), "여는 시각")
    require_half_hour_grid(time(18, 30), "여는 시각")


def test_half_hour_grid_rejects_off_grid_minute() -> None:
    with pytest.raises(ValueError, match="30분"):
        require_half_hour_grid(time(18, 20), "여는 시각")


def test_closes_after_opens_rejects_equal_times() -> None:
    with pytest.raises(ValueError, match="늦어야"):
        require_closes_after_opens(time(20, 0), time(20, 0))


def test_closes_after_opens_rejects_earlier_close() -> None:
    with pytest.raises(ValueError, match="늦어야"):
        require_closes_after_opens(time(20, 0), time(19, 0))


def test_closes_after_opens_accepts_a_later_close() -> None:
    require_closes_after_opens(time(18, 0), time(23, 0))


def test_require_room_name_trims_surrounding_whitespace() -> None:
    assert require_room_name("  1번방  ") == "1번방"


def test_require_room_name_rejects_an_empty_string() -> None:
    with pytest.raises(ValueError, match="합주실 이름"):
        require_room_name("")


def test_require_room_name_rejects_a_whitespace_only_string() -> None:
    with pytest.raises(ValueError, match="합주실 이름"):
        require_room_name("   ")
