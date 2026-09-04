from datetime import date, datetime

import pytest

from backend.api.unavailable_input import (
    require_repeat_until_only_when_weekly,
    require_valid_slot_bounds,
)


def test_accepts_a_valid_half_hour_aligned_interval() -> None:
    require_valid_slot_bounds(datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 30))


def test_rejects_off_grid_minutes() -> None:
    with pytest.raises(ValueError, match="30분"):
        require_valid_slot_bounds(datetime(2026, 9, 14, 18, 10), datetime(2026, 9, 14, 19, 0))


def test_rejects_an_end_not_after_the_start() -> None:
    with pytest.raises(ValueError):
        require_valid_slot_bounds(datetime(2026, 9, 14, 19, 0), datetime(2026, 9, 14, 18, 0))


def test_rejects_timezone_aware_moments() -> None:
    from datetime import timezone

    with pytest.raises(ValueError, match="시간대"):
        require_valid_slot_bounds(
            datetime(2026, 9, 14, 18, 0, tzinfo=timezone.utc),
            datetime(2026, 9, 14, 19, 0, tzinfo=timezone.utc),
        )


def test_allows_repeat_until_when_repeating_weekly() -> None:
    require_repeat_until_only_when_weekly(True, date(2026, 12, 31))


def test_allows_no_repeat_until_when_not_repeating() -> None:
    require_repeat_until_only_when_weekly(False, None)


def test_rejects_repeat_until_when_not_repeating_weekly() -> None:
    with pytest.raises(ValueError, match="반복"):
        require_repeat_until_only_when_weekly(False, date(2026, 12, 31))
