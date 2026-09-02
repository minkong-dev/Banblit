from datetime import datetime

from backend.scheduling.availability import Member, Team, is_team_available
from backend.scheduling.interval import TimeInterval


def test_team_unavailable_when_any_member_is_unavailable() -> None:
    slot = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 19, 30))
    busy = Member(
        id=1,
        unavailable=[TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 20, 0))],
    )
    free = Member(id=2, unavailable=[])
    team = Team(id=1, members=[busy, free])

    assert is_team_available(team, slot) is False


def test_team_available_when_all_members_are_available() -> None:
    slot = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 19, 30))
    a = Member(id=1, unavailable=[])
    b = Member(
        id=2,
        unavailable=[TimeInterval(datetime(2026, 7, 20, 9, 0), datetime(2026, 7, 20, 10, 0))],
    )
    team = Team(id=1, members=[a, b])

    assert is_team_available(team, slot) is True
