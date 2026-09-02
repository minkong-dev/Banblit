from datetime import datetime

from backend.scheduling.assignment import Room, assign
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 20, hour, minute)


def test_team_is_assigned_only_to_a_slot_it_is_available_for() -> None:
    room = Room(id=1, open_period=TimeInterval(_at(18), _at(19)))
    # 18:00~18:30 칸에 불가능 → 남은 18:30~19:00 칸으로만 갈 수 있다.
    member = Member(id=1, unavailable=[TimeInterval(_at(18), _at(18, 30))])
    team = Team(id=10, members=[member])

    result = assign(teams=[team], rooms=[room], slots_per_team=1)

    assert result.feasible is True
    assert result.slots_by_team[10][0].interval == TimeInterval(_at(18, 30), _at(19))


def test_team_gets_exactly_the_requested_number_of_slots() -> None:
    room = Room(id=1, open_period=TimeInterval(_at(18), _at(19, 30)))
    team = Team(id=10, members=[Member(id=1, unavailable=[])])

    result = assign(teams=[team], rooms=[room], slots_per_team=2)

    assert result.feasible is True
    assert len(result.slots_by_team[10]) == 2
