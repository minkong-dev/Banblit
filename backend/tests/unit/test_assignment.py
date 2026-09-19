from datetime import datetime, timedelta

from backend.scheduling.assignment import Room
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from conftest import assign


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 20, hour, minute)


def test_team_is_assigned_only_to_a_slot_it_is_available_for() -> None:
    room = Room(id=1, open_period=TimeInterval(_at(18), _at(20)))
    # slot(1시간 단위 시간 칸)의 18:00~19:00에서 불가능 시간이 있으므로 남은 19:00~20:00 slot에만 배정할 수 있습니다.
    member = Member(id=1, unavailable=[TimeInterval(_at(18), _at(19))])
    team = Team(id=10, members=[member])

    result = assign(teams=[team], rooms=[room], sessions_per_team=1)

    assert result.feasible is True
    assert result.sessions_by_team[10][0].interval == TimeInterval(_at(19), _at(20))


def test_team_gets_exactly_the_requested_number_of_slots() -> None:
    room = Room(id=1, open_period=TimeInterval(_at(18), _at(20)))
    team = Team(id=10, members=[Member(id=1, unavailable=[])])

    result = assign(teams=[team], rooms=[room], sessions_per_team=2)

    assert result.feasible is True
    assert len(result.sessions_by_team[10]) == 2


def test_session_occupies_one_uninterrupted_interval() -> None:
    # 30분 칸에 60분 session 이면, 배정 결과는 30분 칸 2개가 아니라 60분 구간 1개입니다.
    room = Room(id=1, open_period=TimeInterval(_at(18), _at(20)))
    team = Team(id=10, members=[Member(id=1, unavailable=[])])

    result = assign(
        teams=[team],
        rooms=[room],
        sessions_per_team=1,
        slot_minutes=30,
        session_minutes=60,
    )

    assert result.feasible is True
    assigned = result.sessions_by_team[10]
    assert len(assigned) == 1
    assert assigned[0].interval.end - assigned[0].interval.start == timedelta(minutes=60)


def test_two_sessions_of_the_same_team_do_not_overlap() -> None:
    # 18~20시에 60분 session 2개를 배정하면 18:00~19:00 과 19:00~20:00 뿐입니다.
    room = Room(id=1, open_period=TimeInterval(_at(18), _at(20)))
    team = Team(id=10, members=[Member(id=1, unavailable=[])])

    result = assign(
        teams=[team],
        rooms=[room],
        sessions_per_team=2,
        slot_minutes=30,
        session_minutes=60,
    )

    assert result.feasible is True
    intervals = sorted(
        (s.interval for s in result.sessions_by_team[10]), key=lambda i: i.start
    )
    assert intervals == [
        TimeInterval(_at(18), _at(19)),
        TimeInterval(_at(19), _at(20)),
    ]


def test_two_teams_do_not_share_a_slot_that_a_session_covers() -> None:
    # 두 팀의 session 이 30분만 겹치는 것도 허용하지 않습니다. 합주실 하나에 팀 하나입니다.
    room = Room(id=1, open_period=TimeInterval(_at(18), _at(20)))
    team_a = Team(id=10, members=[Member(id=1, unavailable=[])])
    team_b = Team(id=20, members=[Member(id=2, unavailable=[])])

    result = assign(
        teams=[team_a, team_b],
        rooms=[room],
        sessions_per_team=1,
        slot_minutes=30,
        session_minutes=60,
    )

    assert result.feasible is True
    first = result.sessions_by_team[10][0].interval
    second = result.sessions_by_team[20][0].interval
    assert first.end <= second.start or second.end <= first.start


def test_open_slots_exclude_every_slot_a_session_covers() -> None:
    # 19시 이후가 불가능하므로 session 은 18:00~19:00 하나뿐이고, 남는 칸은 19시 이후 30분 칸 2개입니다.
    room = Room(id=1, open_period=TimeInterval(_at(18), _at(20)))
    member = Member(id=1, unavailable=[TimeInterval(_at(19), _at(20))])
    team = Team(id=10, members=[member])

    result = assign(
        teams=[team],
        rooms=[room],
        sessions_per_team=1,
        slot_minutes=30,
        session_minutes=60,
    )

    assert result.feasible is True
    assert [slot.interval for slot in result.open_slots] == [
        TimeInterval(_at(19), _at(19, 30)),
        TimeInterval(_at(19, 30), _at(20)),
    ]
