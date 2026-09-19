from datetime import datetime

import pytest

from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_sessions, generate_slots


def test_open_period_splits_into_one_hour_slots() -> None:
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 20, 0),
    )

    slots = generate_slots(open_period, slot_minutes=60)

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
        generate_slots(open_period, slot_minutes=60)


def test_rejects_period_that_does_not_end_on_the_grid() -> None:
    # 나머지 시간을 오류 메시지 없이 버리지 않습니다. 1시간으로 나누어떨어지지 않으면 오류를 발생시킵니다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 19, 10),
    )

    with pytest.raises(ValueError):
        generate_slots(open_period, slot_minutes=60)


def test_rejects_period_with_seconds() -> None:
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0, 30),
        end=datetime(2026, 7, 20, 19, 0, 30),
    )

    with pytest.raises(ValueError):
        generate_slots(open_period, slot_minutes=60)


# TimeInterval이 뒤집힌 구간과 길이 0인 구간을 거부합니다.
# 해당 검사는 test_validation.py가 담당합니다.


def test_long_period_produces_the_exact_number_of_slots() -> None:
    # 18시부터 23시까지 5시간이므로 1시간 칸 5개를 생성합니다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 23, 0),
    )

    slots = generate_slots(open_period, slot_minutes=60)

    assert len(slots) == 5
    assert slots[0].start == datetime(2026, 7, 20, 18, 0)
    assert slots[-1].end == datetime(2026, 7, 20, 23, 0)


def test_period_can_cross_midnight() -> None:
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 23, 0),
        end=datetime(2026, 7, 21, 1, 0),
    )

    slots = generate_slots(open_period, slot_minutes=60)

    assert len(slots) == 2
    assert slots[-1].end == datetime(2026, 7, 21, 1, 0)


def test_sessions_start_at_every_slot_boundary() -> None:
    # session(합주 1회가 이어지는 구간)은 slot 격자의 모든 시각에서 시작할 수 있습니다.
    # 30분 격자에 60분 합주면 18:00·18:30·19:00 세 곳에서 시작합니다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 20, 0),
    )

    sessions = generate_sessions(open_period, slot_minutes=30, session_minutes=60)

    assert sessions == [
        TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0)),
        TimeInterval(datetime(2026, 7, 20, 18, 30), datetime(2026, 7, 20, 19, 30)),
        TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 20, 0)),
    ]


def test_session_that_would_run_past_the_open_period_is_not_generated() -> None:
    # 운영 시간이 session 1회보다 짧으면 배정할 수 있는 자리가 없으므로 빈 목록을 반환합니다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 18, 30),
    )

    assert generate_sessions(open_period, slot_minutes=30, session_minutes=60) == []


def test_rejects_session_length_that_is_not_a_multiple_of_the_slot() -> None:
    # 45분 session 은 30분 격자에서 끝이 격자를 벗어납니다. settings 의 CHECK 제약이
    # 저장을 막지만, 엔진도 자기 입력을 검증합니다.
    open_period = TimeInterval(
        start=datetime(2026, 7, 20, 18, 0),
        end=datetime(2026, 7, 20, 20, 0),
    )

    with pytest.raises(ValueError, match="배수"):
        generate_sessions(open_period, slot_minutes=30, session_minutes=45)
