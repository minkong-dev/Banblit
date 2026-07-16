from datetime import datetime

from backend.scheduling.assignment import assign
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval


def test_two_teams_cannot_share_the_only_slot_when_one_room():
    slot_a = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    slot_b = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 20, 0))
    # 두 팀 모두 slot_b에는 불가능 → 각 팀이 쓸 수 있는 건 slot_a 하나뿐
    team_a = Team(name="A", members=[Member(name="m1", unavailable=[slot_b])])
    team_b = Team(name="B", members=[Member(name="m2", unavailable=[slot_b])])

    # 합주실이 1개라 slot_a에 두 팀을 동시에 넣을 수 없다 → 배정 실패
    result = assign(teams=[team_a, team_b], slots=[slot_a, slot_b], slots_per_team=1, rooms=1)

    assert result.feasible is False


def test_two_independent_teams_can_share_a_slot_when_two_rooms():
    slot_a = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    team_a = Team(name="A", members=[Member(name="m1", unavailable=[])])
    team_b = Team(name="B", members=[Member(name="m2", unavailable=[])])

    # 방이 2개면 서로 다른 두 팀은 같은 슬롯에 동시에 들어갈 수 있다
    result = assign(teams=[team_a, team_b], slots=[slot_a], slots_per_team=1, rooms=2)

    assert result.feasible is True
    assert result.slots_by_team["A"] == [slot_a]
    assert result.slots_by_team["B"] == [slot_a]
