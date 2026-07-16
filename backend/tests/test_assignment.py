from datetime import datetime

from backend.scheduling.assignment import assign
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval


def test_team_is_assigned_only_to_a_slot_it_is_available_for():
    slot_a = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    slot_b = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 20, 0))
    # 멤버가 18~19시(slot_a)에 불가능 → 팀은 slot_a 배정 불가
    member = Member(name="hong", unavailable=[slot_a])
    team = Team(name="A", members=[member])

    result = assign(teams=[team], slots=[slot_a, slot_b], slots_per_team=1)

    assert result.slots_by_team["A"] == [slot_b]


def test_team_gets_exactly_the_requested_number_of_slots():
    slots = [
        TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 18, 30)),
        TimeInterval(datetime(2026, 7, 20, 18, 30), datetime(2026, 7, 20, 19, 0)),
        TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 19, 30)),
    ]
    team = Team(name="A", members=[Member(name="hong", unavailable=[])])

    result = assign(teams=[team], slots=slots, slots_per_team=2)

    assert result.feasible is True
    assert len(result.slots_by_team["A"]) == 2
