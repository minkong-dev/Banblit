from datetime import datetime

import pytest

from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_slots


def test_open_period_splits_into_half_hour_slots() -> None:
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 19, 0),
    )

    slots = generate_slots(open_period)

    assert slots == [
        TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 18, 30)),
        TimeInterval(datetime(2026, 7, 20, 18, 30), datetime(2026, 7, 20, 19, 0)),
    ]


def test_rejects_period_that_does_not_start_on_the_grid() -> None:
    # 운영시간은 정시 또는 30분에서만 시작할 수 있다. 18:10 시작은 잘못된 설정이다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 10),
        end=datetime(2026, 7, 20, 19, 10),
    )

    with pytest.raises(ValueError):
        generate_slots(open_period)


def test_rejects_period_that_does_not_end_on_the_grid() -> None:
    # 자투리를 조용히 버리지 않는다. 30분으로 나누어떨어지지 않으면 잘못된 설정이다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 19, 10),
    )

    with pytest.raises(ValueError):
        generate_slots(open_period)


def test_rejects_period_with_seconds() -> None:
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0, 30),
        end=datetime(2026, 7, 20, 19, 0, 30),
    )

    with pytest.raises(ValueError):
        generate_slots(open_period)


# 뒤집힌 구간과 길이 0 구간은 TimeInterval 자체가 거부한다.
# 해당 검사는 test_validation.py 가 담당한다.


def test_long_period_produces_the_exact_number_of_slots() -> None:
    # 18시부터 23시까지 다섯 시간 → 30분 칸 열 개
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 23, 0),
    )

    slots = generate_slots(open_period)

    assert len(slots) == 10
    assert slots[0].start == datetime(2026, 7, 20, 18, 0)
    assert slots[-1].end == datetime(2026, 7, 20, 23, 0)


def test_period_can_cross_midnight() -> None:
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 23, 0),
        end=datetime(2026, 7, 21, 1, 0),
    )

    slots = generate_slots(open_period)

    assert len(slots) == 4
    assert slots[-1].end == datetime(2026, 7, 21, 1, 0)
