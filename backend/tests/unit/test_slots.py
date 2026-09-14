from datetime import datetime

import pytest

from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_slots


def test_open_period_splits_into_one_hour_slots() -> None:
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 20, 0),
    )

    slots = generate_slots(open_period)

    assert slots == [
        TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0)),
        TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 20, 0)),
    ]


def test_rejects_period_that_does_not_start_on_the_grid() -> None:
    # 운영시간은 정시에 시작해야 합니다. 18:10 시작은 잘못된 설정입니다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 10),
        end=datetime(2026, 7, 20, 19, 10),
    )

    with pytest.raises(ValueError):
        generate_slots(open_period)


def test_rejects_period_that_does_not_end_on_the_grid() -> None:
    # 나머지 시간을 오류 메시지 없이 버리지 않습니다. 1시간으로 나누어떨어지지 않으면 오류를 발생시킵니다.
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


# TimeInterval이 뒤집힌 구간과 길이 0인 구간을 거부합니다.
# 해당 검사는 test_validation.py가 담당합니다.


def test_long_period_produces_the_exact_number_of_slots() -> None:
    # 18시부터 23시까지 5시간이므로 1시간 칸 5개를 생성합니다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 23, 0),
    )

    slots = generate_slots(open_period)

    assert len(slots) == 5
    assert slots[0].start == datetime(2026, 7, 20, 18, 0)
    assert slots[-1].end == datetime(2026, 7, 20, 23, 0)


def test_period_can_cross_midnight() -> None:
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 23, 0),
        end=datetime(2026, 7, 21, 1, 0),
    )

    slots = generate_slots(open_period)

    assert len(slots) == 2
    assert slots[-1].end == datetime(2026, 7, 21, 1, 0)
