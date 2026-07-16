from datetime import datetime

import pytest

from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_slots


def test_open_period_splits_into_fixed_length_slots():
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 19, 0),
    )

    slots = generate_slots(open_period, unit_minutes=30)

    assert slots == [
        TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 18, 30)),
        TimeInterval(datetime(2026, 7, 20, 18, 30), datetime(2026, 7, 20, 19, 0)),
    ]


def test_last_incomplete_slot_is_dropped():
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 19, 10),  # 70분
    )

    slots = generate_slots(open_period, unit_minutes=30)

    # 30분 슬롯 2개만 나오고 남는 10분은 버린다
    assert slots == [
        TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 18, 30)),
        TimeInterval(datetime(2026, 7, 20, 18, 30), datetime(2026, 7, 20, 19, 0)),
    ]


def test_generate_slots_rejects_non_positive_unit():
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 19, 0),
    )

    with pytest.raises(ValueError):
        generate_slots(open_period, unit_minutes=0)
