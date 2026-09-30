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


def _is_one_run(intervals: list[TimeInterval]) -> bool:
    """배정된 구간이 빈틈 없이 하나로 이어지는지 봅니다."""
    ordered = sorted(intervals, key=lambda interval: interval.start)
    return all(left.end == right.start for left, right in zip(ordered, ordered[1:]))


def test_sessions_of_a_team_are_placed_back_to_back() -> None:
    # 불가능 시간이 없으면 팀의 칸은 흩어지지 않고 하나로 이어집니다(2026-09-28 사용자 결정).
    room = Room(id=1, open_period=TimeInterval(_at(10), _at(20)))
    team = Team(id=10, members=[Member(id=1, unavailable=[])])

    result = assign(teams=[team], rooms=[room], sessions_per_team=3)

    assert result.feasible is True
    assert _is_one_run([session.interval for session in result.sessions_by_team[10]])


def test_sessions_skip_only_the_unavailable_hour() -> None:
    # 10~11 시와 12~14 시가 가능합니다. 2칸이면 떨어진 10시·12시가 아니라 이어진 12~14 시에 배정합니다.
    room = Room(id=1, open_period=TimeInterval(_at(10), _at(14)))
    member = Member(id=1, unavailable=[TimeInterval(_at(11), _at(12))])
    team = Team(id=10, members=[member])

    result = assign(teams=[team], rooms=[room], sessions_per_team=2)

    assert result.feasible is True
    assert sorted((session.interval for session in result.sessions_by_team[10]), key=lambda i: i.start) == [
        TimeInterval(_at(12), _at(13)),
        TimeInterval(_at(13), _at(14)),
    ]


def test_assignment_stops_improving_shortly_after_the_first_solution() -> None:
    # 연속 배정을 더 늘릴 수 있는지는 끝까지 증명하지 못해, 그대로 두면 상한(60초)을 다 씁니다. 첫 배정을 찾은 뒤
    # 개선은 improve_seconds_after_first(3초)만 하고 멈춥니다. 12팀·40명·합주실 2개·7일 규모에서 잽니다.
    import random
    import time

    from backend.scheduling.assignment import assign as assign_sessions

    rng = random.Random(20260928)
    day0 = datetime(2026, 10, 1)
    people = [
        Member(id=pid, unavailable=[
            TimeInterval(day0 + timedelta(days=d, hours=s), day0 + timedelta(days=d, hours=s + 2))
            for d in range(7) if rng.random() < 0.35 for s in [rng.choice([13, 15, 17, 18, 19])]
        ])
        for pid in range(40)
    ]
    teams = [Team(id=t, members=rng.sample(people, rng.randint(4, 6))) for t in range(12)]
    rooms = [
        Room(id=room_id, open_period=TimeInterval(day0 + timedelta(days=d, hours=12), day0 + timedelta(days=d, hours=close)))
        for d in range(7) for room_id, close in ((1, 23), (2, 22))
    ]

    started = time.monotonic()
    result = assign_sessions(teams, rooms, 7, 60, 60, 60.0, 3.0)

    assert result.feasible is True
    # 상한 60초보다 충분히 짧은지만 봅니다. 첫 해를 찾는 시간은 CPU 부하에 따라 달라 좁게 잡지 않습니다.
    assert time.monotonic() - started < 30


def test_a_team_gets_no_more_than_the_daily_limit_on_one_day() -> None:
    # 하루 상한 2시간이면 4시간을 이틀에 2시간씩 나눕니다. 같은 날 안에서는 붙입니다.
    rooms = [
        Room(id=1, open_period=TimeInterval(_at(10), _at(20))),
        Room(id=1, open_period=TimeInterval(_at(10) + timedelta(days=1), _at(20) + timedelta(days=1))),
    ]
    team = Team(id=10, members=[Member(id=1, unavailable=[])])

    from backend.scheduling.assignment import assign as assign_sessions

    result = assign_sessions([team], rooms, 4, 60, 60, 10.0, 1.0, daily_max_minutes=120)

    assert result.feasible is True
    by_day: dict[object, list[TimeInterval]] = {}
    for session in result.sessions_by_team[10]:
        by_day.setdefault(session.interval.start.date(), []).append(session.interval)
    assert sorted(len(day) for day in by_day.values()) == [2, 2]
    assert all(_is_one_run(day) for day in by_day.values())
