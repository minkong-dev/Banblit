from datetime import datetime

from backend.scheduling.assignment import assign
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval


def test_shared_member_cannot_play_two_teams_at_once_even_with_multiple_rooms():
    slot_a = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    slot_b = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 20, 0))
    # 김씨는 두 팀(A, B)에 모두 속하고, slot_b에는 불가능 → 쓸 수 있는 건 slot_a뿐
    kim = Member(name="kim", unavailable=[slot_b])
    team_a = Team(name="A", members=[kim])
    team_b = Team(name="B", members=[kim])

    # 방이 2개라 한 슬롯 수용은 되지만, 김씨가 한 몸이라 두 팀이 동시에 slot_a 불가 → 실패
    result = assign(teams=[team_a, team_b], slots=[slot_a, slot_b], slots_per_team=1, rooms=2)

    assert result.feasible is False
