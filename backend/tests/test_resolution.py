from datetime import datetime

from backend.scheduling.assignment import Room
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import resolve


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 20, hour, minute)


def _one_slot_room(name: str = "1번방") -> Room:
    return Room(name=name, open_period=TimeInterval(_at(18), _at(18, 30)))


def test_successful_assignment_returns_no_proposals():
    team = Team(name="A", members=[Member(name="hong", unavailable=[])])

    result = resolve(teams=[team], rooms=[_one_slot_room()], slots_per_team=1)

    assert result.assignment.feasible is True
    assert result.proposals == []


def test_proposes_excluding_the_member_who_blocks_the_team():
    # blocker 는 유일한 칸에 불가능 → 팀 전원 가능이 성립하지 못한다.
    blocker = Member(name="blocker", unavailable=[TimeInterval(_at(18), _at(18, 30))])
    free = Member(name="free", unavailable=[])
    team = Team(name="A", members=[blocker, free])

    result = resolve(teams=[team], rooms=[_one_slot_room()], slots_per_team=1)

    assert result.assignment.feasible is False
    assert [p.excluded_member for p in result.proposals] == ["blocker"]
    assert result.proposals[0].assignment.feasible is True


def test_does_not_propose_excluding_a_member_when_it_would_empty_their_team():
    # 팀에 한 명뿐이고 그 사람이 유일한 칸에 불가능 → 빼면 팀이 사라진다.
    blocker = Member(name="blocker", unavailable=[TimeInterval(_at(18), _at(18, 30))])
    team = Team(name="A", members=[blocker])

    result = resolve(teams=[team], rooms=[_one_slot_room()], slots_per_team=1)

    assert result.assignment.feasible is False
    assert result.proposals == []


def test_no_proposals_when_no_single_exclusion_can_help():
    # 두 팀 모두 가능하지만 칸이 하나뿐 → 누굴 빼도 자리가 늘지 않는다.
    team_a = Team(
        name="A",
        members=[Member(name="a1", unavailable=[]), Member(name="a2", unavailable=[])],
    )
    team_b = Team(
        name="B",
        members=[Member(name="b1", unavailable=[]), Member(name="b2", unavailable=[])],
    )

    result = resolve(teams=[team_a, team_b], rooms=[_one_slot_room()], slots_per_team=1)

    assert result.assignment.feasible is False
    assert result.proposals == []
