"""하루 중의 범위(시작 시간, 종료 시간)가 00:00 마감을 다음 날 00:00 으로 다루는지 검증합니다(사용자 결정 2026-10-12)."""

from datetime import date, datetime, time

import pytest

from backend.scheduling.pipeline import day_window
from backend.services.validation.rules import require_clock_range, require_within_room_window

DAY = date(2026, 9, 14)


def test_a_window_ending_later_the_same_day_stays_on_that_day() -> None:
    window = day_window(DAY, time(18, 0), time(23, 0))

    assert (window.start, window.end) == (datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 23, 0))


def test_a_window_ending_at_midnight_ends_on_the_next_day() -> None:
    window = day_window(DAY, time(18, 0), time(0, 0))

    assert window.end == datetime(2026, 9, 15, 0, 0)


def test_a_range_closing_at_midnight_is_accepted() -> None:
    require_clock_range(time(18, 0), time(0, 0), "합주실 운영 시간")


def test_a_range_with_equal_times_is_rejected() -> None:
    with pytest.raises(ValueError, match="같을 수 없어요"):
        require_clock_range(time(18, 0), time(18, 0), "합주실 운영 시간")


def test_a_range_past_midnight_other_than_midnight_is_rejected() -> None:
    with pytest.raises(ValueError, match="00:00"):
        require_clock_range(time(18, 0), time(2, 0), "합주실 운영 시간")


def test_a_reservation_up_to_midnight_fits_a_room_closing_at_midnight() -> None:
    require_within_room_window(time(18, 0), time(0, 0), datetime(2026, 9, 14, 22, 0), datetime(2026, 9, 15, 0, 0))


def test_a_reservation_past_midnight_is_outside_a_room_closing_at_midnight() -> None:
    with pytest.raises(ValueError, match="운영 시간"):
        require_within_room_window(time(18, 0), time(0, 0), datetime(2026, 9, 14, 23, 0), datetime(2026, 9, 15, 1, 0))


def test_a_reservation_before_opening_is_outside_the_room_window() -> None:
    with pytest.raises(ValueError, match="운영 시간"):
        require_within_room_window(time(18, 0), time(22, 0), datetime(2026, 9, 14, 17, 0), datetime(2026, 9, 14, 19, 0))
