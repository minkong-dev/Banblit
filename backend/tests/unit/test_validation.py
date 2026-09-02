"""잘못된 입력을 조용히 삼키지 않고 거부하는지 검사한다.

여기서 막지 못하면 엔진이 '틀린 답'을 자신 있게 내놓는다.
"""

from datetime import datetime, timedelta, timezone

import pytest

from backend.scheduling.assignment import Room, assign
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval

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
    # 시간대 지원은 아직 설계되지 않았다. 조용히 잘못 계산하느니 거부한다.
    with pytest.raises(ValueError):
        TimeInterval(_at(18).replace(tzinfo=KST), _at(19).replace(tzinfo=KST))


# ── 한 칸은 방 번호와 시각으로 하나뿐이어야 한다 ────────────


def test_rejects_the_same_room_opening_twice_over_the_same_time() -> None:
    # 같은 방의 같은 시각이 두 칸으로 세어지면 두 팀이 같은 자리에 들어간다.
    with pytest.raises(ValueError):
        assign(teams=[_team()], rooms=[_room(1), _room(1)], slots_per_team=1)


def test_rejects_overlapping_open_periods_for_the_same_room() -> None:
    # 19~21시는 앞의 18~20시와 19~20시 구간이 겹친다.
    late = Room(id=1, open_period=TimeInterval(_at(19), _at(21)))
    with pytest.raises(ValueError):
        assign(teams=[_team()], rooms=[_room(1), late], slots_per_team=1)


def test_accepts_the_same_room_opening_on_different_days() -> None:
    # 기간 배정은 합주실 하나를 날짜마다 한 번씩 넘긴다. 이건 겹치지 않으므로 정상이다.
    day_one = Room(id=1, open_period=TimeInterval(_at(18), _at(20)))
    day_two = Room(id=1, open_period=TimeInterval(_at(18, day=21), _at(20, day=21)))

    result = assign(teams=[_team()], rooms=[day_one, day_two], slots_per_team=1)

    assert result.feasible is True


def test_rejects_duplicate_team_ids() -> None:
    with pytest.raises(ValueError):
        assign(
            teams=[_team(10, member_id=1), _team(10, member_id=2)],
            rooms=[_room()],
            slots_per_team=1,
        )


# ── 명단의 유효성 ────────────────────────────────────────────


def test_rejects_a_member_listed_twice_in_the_same_team() -> None:
    # 같은 사람을 두 번 적는 것은 명단 오류다.
    # 조용히 넘어가면 엔진이 '이 사람을 빼라'는 엉뚱한 조율안을 낸다.
    kim = Member(id=7, unavailable=[])
    with pytest.raises(ValueError):
        assign(teams=[Team(id=10, members=[kim, kim])], rooms=[_room()], slots_per_team=1)


def test_rejects_a_team_with_no_members() -> None:
    with pytest.raises(ValueError):
        assign(teams=[Team(id=10, members=[])], rooms=[_room()], slots_per_team=1)


# ── 요청 개수의 유효성 ───────────────────────────────────────


def test_rejects_negative_slots_per_team() -> None:
    with pytest.raises(ValueError):
        assign(teams=[_team()], rooms=[_room()], slots_per_team=-1)
