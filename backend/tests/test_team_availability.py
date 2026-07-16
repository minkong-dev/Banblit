from datetime import datetime

from backend.scheduling.availability import Member, Team, is_team_available
from backend.scheduling.interval import TimeInterval


def test_team_unavailable_when_any_member_is_unavailable():
    slot = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 19, 30))
    busy = Member(
        name="drummer",
        unavailable=[TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 20, 0))],
    )
    free = Member(name="guitarist", unavailable=[])
    team = Team(name="A", members=[busy, free])

    assert is_team_available(team, slot) is False


def test_team_available_when_all_members_are_available():
    slot = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 19, 30))
    a = Member(name="drummer", unavailable=[])
    b = Member(
        name="guitarist",
        unavailable=[TimeInterval(datetime(2026, 7, 20, 9, 0), datetime(2026, 7, 20, 10, 0))],
    )
    team = Team(name="A", members=[a, b])

    assert is_team_available(team, slot) is True
