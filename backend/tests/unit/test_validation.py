"""잘못된 입력을 오류 없이 통과시키지 않고 거부하는지 검증합니다.

이 검증을 통과시키면 엔진이 error 를 발생시키지 않고 잘못된 배정안을 출력합니다.
"""

from datetime import datetime, timedelta, timezone

import pytest

from backend.scheduling.assignment import Room
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from conftest import assign

KST = timezone(timedelta(hours=9))


def _at(hour: int, minute: int = 0, day: int = 20) -> datetime:
    return datetime(2026, 7, day, hour, minute)


def _room(room_id: int = 1) -> Room:
    return Room(id=room_id, open_period=TimeInterval(_at(18), _at(20)))


def _team(team_id: int = 10, member_id: int = 1) -> Team:
    return Team(id=team_id, members=[Member(id=member_id, unavailable=[])])


# ── 시간 구간 자체의 유효성 ──────────────────────────────────


def test_interval_rejects_end_before_start() -> None:
    with pytest.raises(ValueError):
        TimeInterval(_at(19), _at(18))


def test_interval_rejects_zero_length() -> None:
    with pytest.raises(ValueError):
        TimeInterval(_at(18), _at(18))


def test_interval_rejects_mixed_timezone_awareness() -> None:
    with pytest.raises(ValueError):
        TimeInterval(_at(18), _at(19).replace(tzinfo=KST))


def test_interval_rejects_timezone_aware_values() -> None:
    # 시간대 지원은 미구현입니다. error 없이 잘못된 결과를 계산하는 것보다 거부하는 편이 낫습니다.
    with pytest.raises(ValueError):
        TimeInterval(_at(18).replace(tzinfo=KST), _at(19).replace(tzinfo=KST))


# ── slot 은 합주실 번호와 시각으로 유일해야 합니다 ──────────────


def test_rejects_the_same_room_opening_twice_over_the_same_time() -> None:
    # 같은 합주실의 같은 시간이 두 slot으로 세어지면 두 팀이 같은 자리에 배정됩니다.
    with pytest.raises(ValueError):
        assign(teams=[_team()], rooms=[_room(1), _room(1)], sessions_per_team=1)


def test_rejects_overlapping_open_periods_for_the_same_room() -> None:
    # 19~21시는 앞의 18~20시 및 19~20시 slot과 겹칩니다.
    late = Room(id=1, open_period=TimeInterval(_at(19), _at(21)))
    with pytest.raises(ValueError):
        assign(teams=[_team()], rooms=[_room(1), late], sessions_per_team=1)


def test_accepts_the_same_room_opening_on_different_days() -> None:
    # 기간 배정은 합주실 하나를 날짜마다 한 번씩 제공합니다. 이는 겹치지 않으므로 유효합니다.
    day_one = Room(id=1, open_period=TimeInterval(_at(18), _at(20)))
    day_two = Room(id=1, open_period=TimeInterval(_at(18, day=21), _at(20, day=21)))

    result = assign(teams=[_team()], rooms=[day_one, day_two], sessions_per_team=1)

    assert result.feasible is True


def test_rejects_duplicate_team_ids() -> None:
    with pytest.raises(ValueError):
        assign(
            teams=[_team(10, member_id=1), _team(10, member_id=2)],
            rooms=[_room()],
            sessions_per_team=1,
        )


# ── 명단의 유효성 ────────────────────────────────────────────


def test_rejects_a_member_listed_twice_in_the_same_team() -> None:
    # 같은 멤버를 두 번 포함하는 것은 명단 오류입니다.
    # 오류 메시지 없이 넘어가면 배정 엔진이 잘못된 조율안을 출력합니다.
    kim = Member(id=7, unavailable=[])
    with pytest.raises(ValueError):
        assign(teams=[Team(id=10, members=[kim, kim])], rooms=[_room()], sessions_per_team=1)


def test_rejects_a_team_with_no_members() -> None:
    with pytest.raises(ValueError):
        assign(teams=[Team(id=10, members=[])], rooms=[_room()], sessions_per_team=1)


# ── 요청 개수의 유효성 ───────────────────────────────────────


def test_rejects_negative_sessions_per_team() -> None:
    with pytest.raises(ValueError):
        assign(teams=[_team()], rooms=[_room()], sessions_per_team=-1)
