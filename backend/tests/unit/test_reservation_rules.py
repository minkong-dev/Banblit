"""reservation 의 지난 시각 예약 거절을 DB 없이 검증합니다."""

from datetime import datetime

import pytest

from backend.services.reservation.reservation_service import _require_not_started


def test_a_reservation_starting_in_the_future_passes() -> None:
    _require_not_started(datetime(2026, 10, 15, 19, 0), datetime(2026, 10, 15, 18, 59))


def test_a_reservation_that_already_started_is_refused() -> None:
    with pytest.raises(ValueError, match="과거"):
        _require_not_started(datetime(2026, 10, 15, 19, 0), datetime(2026, 10, 15, 19, 0))
