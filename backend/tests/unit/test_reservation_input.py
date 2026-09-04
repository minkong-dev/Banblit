from datetime import datetime, time

import pytest

from backend.api.reservation_input import (
    require_same_day,
    require_valid_slot_bounds,
    require_within_room_hours,
)


def test_accepts_a_valid_half_hour_aligned_interval() -> None:
    require_valid_slot_bounds(datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 30))


def test_rejects_off_grid_minutes() -> None:
    with pytest.raises(ValueError, match="30분"):
        require_valid_slot_bounds(datetime(2026, 9, 14, 18, 15), datetime(2026, 9, 14, 19, 0))


def test_accepts_a_same_day_interval() -> None:
    require_same_day(datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 0))


def test_rejects_an_interval_crossing_midnight() -> None:
    with pytest.raises(ValueError, match="하루"):
        require_same_day(datetime(2026, 9, 14, 23, 0), datetime(2026, 9, 15, 1, 0))


def test_accepts_an_interval_within_room_hours() -> None:
    require_within_room_hours(
        time(18, 0), time(22, 0), datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 20, 0)
    )


def test_rejects_starting_before_the_room_opens() -> None:
    with pytest.raises(ValueError, match="운영 시간"):
        require_within_room_hours(
            time(18, 0), time(22, 0), datetime(2026, 9, 14, 17, 30), datetime(2026, 9, 14, 19, 0)
        )


def test_rejects_ending_after_the_room_closes() -> None:
    with pytest.raises(ValueError, match="운영 시간"):
        require_within_room_hours(
            time(18, 0), time(22, 0), datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 22, 30)
        )
