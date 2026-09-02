from datetime import datetime

from backend.scheduling.assignment import Room
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import resolve


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 20, hour, minute)


def _one_slot_room(room_id: int = 1) -> Room:
    return Room(id=room_id, open_period=TimeInterval(_at(18), _at(18, 30)))


def test_successful_assignment_returns_no_proposals() -> None:
    team = Team(id=10, members=[Member(id=1, unavailable=[])])

    result = resolve(teams=[team], rooms=[_one_slot_room()], slots_per_team=1)

    assert result.assignment.feasible is True
    assert result.proposals == []


def test_proposes_excluding_the_member_who_blocks_the_team() -> None:
    # 1번이 유일한 칸에 불가능 → 팀 전원 가능이 성립하지 못한다.
    blocker = Member(id=1, unavailable=[TimeInterval(_at(18), _at(18, 30))])
    free = Member(id=2, unavailable=[])
    team = Team(id=10, members=[blocker, free])

    result = resolve(teams=[team], rooms=[_one_slot_room()], slots_per_team=1)

    assert result.assignment.feasible is False
    assert [p.excluded_member for p in result.proposals] == [1]
    assert result.proposals[0].assignment.feasible is True


def test_does_not_propose_excluding_a_member_when_it_would_empty_their_team() -> None:
    # 팀에 한 명뿐이고 그 사람이 유일한 칸에 불가능 → 빼면 팀이 사라진다.
    blocker = Member(id=1, unavailable=[TimeInterval(_at(18), _at(18, 30))])
    team = Team(id=10, members=[blocker])

    result = resolve(teams=[team], rooms=[_one_slot_room()], slots_per_team=1)

    assert result.assignment.feasible is False
    assert result.proposals == []


def test_no_proposals_when_no_single_exclusion_can_help() -> None:
    # 두 팀 모두 가능하지만 칸이 하나뿐 → 누굴 빼도 자리가 늘지 않는다.
    team_a = Team(id=10, members=[Member(id=1, unavailable=[]), Member(id=2, unavailable=[])])
    team_b = Team(id=20, members=[Member(id=3, unavailable=[]), Member(id=4, unavailable=[])])

    result = resolve(teams=[team_a, team_b], rooms=[_one_slot_room()], slots_per_team=1)

    assert result.assignment.feasible is False
    assert result.proposals == []
