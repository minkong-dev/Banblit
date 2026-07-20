"""잘못된 입력을 조용히 삼키지 않고 거부하는지 검사한다.

여기서 막지 못하면 엔진이 '틀린 답'을 자신 있게 내놓는다.
"""

from datetime import datetime, timedelta, timezone

import pytest

from backend.scheduling.assignment import Room, assign
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval

KST = timezone(timedelta(hours=9))


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 20, hour, minute)


def _room(name: str = "1번방") -> Room:
    return Room(name=name, open_period=TimeInterval(_at(18), _at(20)))


def _team(name: str = "A", member: str = "m1") -> Team:
    return Team(name=name, members=[Member(name=member, unavailable=[])])


# ── 시간 구간 자체의 유효성 ──────────────────────────────────


def test_interval_rejects_end_before_start():
    with pytest.raises(ValueError):
        TimeInterval(_at(19), _at(18))


def test_interval_rejects_zero_length():
    with pytest.raises(ValueError):
        TimeInterval(_at(18), _at(18))


def test_interval_rejects_mixed_timezone_awareness():
    with pytest.raises(ValueError):
        TimeInterval(_at(18), _at(19).replace(tzinfo=KST))


def test_interval_rejects_timezone_aware_values():
    # 시간대 지원은 아직 설계되지 않았다. 조용히 잘못 계산하느니 거부한다.
    with pytest.raises(ValueError):
        TimeInterval(_at(18).replace(tzinfo=KST), _at(19).replace(tzinfo=KST))


# ── 이름은 식별자다. 겹치면 안 된다 ──────────────────────────


def test_rejects_duplicate_room_names():
    # 같은 이름의 방이 둘이면 결과에서 구분할 수 없어 이중 예약이 된다.
    with pytest.raises(ValueError):
        assign(teams=[_team()], rooms=[_room("R1"), _room("R1")], slots_per_team=1)


def test_rejects_duplicate_team_names():
    with pytest.raises(ValueError):
        assign(
            teams=[_team("A", "m1"), _team("A", "m2")],
            rooms=[_room()],
            slots_per_team=1,
        )


# ── 명단의 유효성 ────────────────────────────────────────────


def test_rejects_a_member_listed_twice_in_the_same_team():
    # 같은 사람을 두 번 적는 것은 명단 오류다.
    # 조용히 넘어가면 엔진이 '이 사람을 빼라'는 엉뚱한 조율안을 낸다.
    kim = Member(name="kim", unavailable=[])
    with pytest.raises(ValueError):
        assign(teams=[Team(name="A", members=[kim, kim])], rooms=[_room()], slots_per_team=1)


def test_rejects_a_team_with_no_members():
    with pytest.raises(ValueError):
        assign(teams=[Team(name="A", members=[])], rooms=[_room()], slots_per_team=1)


# ── 요청 개수의 유효성 ───────────────────────────────────────


def test_rejects_negative_slots_per_team():
    with pytest.raises(ValueError):
        assign(teams=[_team()], rooms=[_room()], slots_per_team=-1)
