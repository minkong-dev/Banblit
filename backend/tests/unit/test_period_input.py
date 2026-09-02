from datetime import date, datetime, time

import pytest

from backend.api.period_input import (
    auto_slots_per_team,
    build_engine_rooms,
    build_engine_teams,
    dates_in_period,
    expand_unavailable,
)
from backend.db.models import Room, UnavailableTime
from backend.scheduling.interval import TimeInterval

WINDOW_START = datetime(2026, 8, 1, 0, 0)
WINDOW_END = datetime(2026, 8, 15, 0, 0)  # 8월 14일까지 포함하는 열린 끝


def _row(
    starts_at: datetime,
    ends_at: datetime,
    repeats_weekly: bool = False,
    repeat_until: date | None = None,
) -> UnavailableTime:
    return UnavailableTime(
        member_id=1,
        starts_at=starts_at,
        ends_at=ends_at,
        repeats_weekly=repeats_weekly,
        repeat_until=repeat_until,
    )


def test_dates_in_period_includes_both_ends() -> None:
    days = dates_in_period(date(2026, 8, 1), date(2026, 8, 3))

    assert days == [date(2026, 8, 1), date(2026, 8, 2), date(2026, 8, 3)]


def test_single_unavailable_time_is_kept_as_is() -> None:
    rows = [_row(datetime(2026, 8, 3, 19, 0), datetime(2026, 8, 3, 21, 0))]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert [(i.start, i.end) for i in result] == [
        (datetime(2026, 8, 3, 19, 0), datetime(2026, 8, 3, 21, 0))
    ]


def test_unavailable_time_outside_the_window_is_dropped() -> None:
    rows = [_row(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 21, 0))]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert result == []


def test_weekly_repeat_fills_every_seventh_day_inside_the_window() -> None:
    rows = [
        _row(
            datetime(2026, 8, 3, 19, 0),
            datetime(2026, 8, 3, 21, 0),
            repeats_weekly=True,
        )
    ]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert [i.start for i in result] == [
        datetime(2026, 8, 3, 19, 0),
        datetime(2026, 8, 10, 19, 0),
    ]
    assert all(i.end - i.start == rows[0].ends_at - rows[0].starts_at for i in result)


def test_weekly_repeat_stops_at_its_repeat_until_date() -> None:
    rows = [
        _row(
            datetime(2026, 8, 3, 19, 0),
            datetime(2026, 8, 3, 21, 0),
            repeats_weekly=True,
            repeat_until=date(2026, 8, 5),
        )
    ]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert [i.start for i in result] == [datetime(2026, 8, 3, 19, 0)]


def test_repeats_weekly_none_is_treated_as_not_repeating() -> None:
    # 세션에 넣지 않은 객체는 repeats_weekly가 아직 기본값(False)이 적용되지 않아
    # None일 수 있다 — 이때도 반복 없는 1회짜리로 다뤄야 한다.
    rows = [
        UnavailableTime(
            member_id=1,
            starts_at=datetime(2026, 8, 3, 19, 0),
            ends_at=datetime(2026, 8, 3, 21, 0),
            repeats_weekly=None,
            repeat_until=None,
        )
    ]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert [(i.start, i.end) for i in result] == [
        (datetime(2026, 8, 3, 19, 0), datetime(2026, 8, 3, 21, 0))
    ]


def test_unavailable_time_straddling_the_window_start_is_kept() -> None:
    # 시작은 기간 밖(7/31), 끝은 기간 안(8/1)에 걸쳐 있다 — 버려지면 안 된다.
    rows = [_row(datetime(2026, 7, 31, 23, 0), datetime(2026, 8, 1, 1, 0))]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert [(i.start, i.end) for i in result] == [
        (datetime(2026, 7, 31, 23, 0), datetime(2026, 8, 1, 1, 0))
    ]


def test_unavailable_time_straddling_the_window_end_is_kept() -> None:
    # 시작은 기간 안(8/14), 끝은 기간 밖(8/15 새벽)에 걸쳐 있다 — 버려지면 안 된다.
    rows = [_row(datetime(2026, 8, 14, 23, 0), datetime(2026, 8, 15, 1, 0))]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert [(i.start, i.end) for i in result] == [
        (datetime(2026, 8, 14, 23, 0), datetime(2026, 8, 15, 1, 0))
    ]


def test_multiple_unavailable_times_for_the_same_person_are_all_kept() -> None:
    """한 사람에게 불가능시간이 둘 이상이면 둘 다 결과에 담겨야 한다.
    rows의 첫 원소만 처리하도록 망가뜨리면 두 번째 행(매주 반복)이 통째로
    사라진다."""
    rows = [
        _row(datetime(2026, 8, 3, 19, 0), datetime(2026, 8, 3, 21, 0)),
        _row(
            datetime(2026, 8, 5, 9, 0),
            datetime(2026, 8, 5, 11, 0),
            repeats_weekly=True,
            repeat_until=date(2026, 8, 12),
        ),
    ]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert [(i.start, i.end) for i in result] == [
        (datetime(2026, 8, 3, 19, 0), datetime(2026, 8, 3, 21, 0)),
        (datetime(2026, 8, 5, 9, 0), datetime(2026, 8, 5, 11, 0)),
        (datetime(2026, 8, 12, 9, 0), datetime(2026, 8, 12, 11, 0)),
    ]


def test_weekly_repeat_that_started_before_the_window_still_lands_inside() -> None:
    rows = [
        _row(
            datetime(2026, 7, 6, 19, 0),
            datetime(2026, 7, 6, 21, 0),
            repeats_weekly=True,
        )
    ]

    result = expand_unavailable(rows, WINDOW_START, WINDOW_END)

    assert [i.start for i in result] == [
        datetime(2026, 8, 3, 19, 0),
        datetime(2026, 8, 10, 19, 0),
    ]


def _room(room_id: int, name: str, opens: time, closes: time) -> Room:
    room = Room(name=name, opens_at=opens, closes_at=closes)
    room.id = room_id
    return room


def test_each_room_becomes_one_engine_room_per_day() -> None:
    rooms = [_room(7, "1번방", time(18, 0), time(20, 0))]
    days = [date(2026, 8, 1), date(2026, 8, 2)]

    engine_rooms = build_engine_rooms(rooms, days)

    # 같은 합주실이 날짜마다 한 번씩, 저장소의 번호를 그대로 달고 나온다.
    assert [r.id for r in engine_rooms] == [7, 7]
    assert engine_rooms[0].open_period.start == datetime(2026, 8, 1, 18, 0)
    assert engine_rooms[0].open_period.end == datetime(2026, 8, 1, 20, 0)
    assert engine_rooms[1].open_period.start == datetime(2026, 8, 2, 18, 0)


def test_rooms_with_the_same_name_stay_separate() -> None:
    # 이름은 엔진에 가지 않는다. 이름이 같아도 번호가 다르면 다른 합주실이다.
    rooms = [
        _room(1, "1번방", time(18, 0), time(20, 0)),
        _room(2, "1번방", time(18, 0), time(20, 0)),
    ]

    engine_rooms = build_engine_rooms(rooms, [date(2026, 8, 1)])

    assert [r.id for r in engine_rooms] == [1, 2]


def test_slots_per_team_is_the_whole_grid_divided_by_team_count() -> None:
    rooms = [_room(1, "1번방", time(18, 0), time(20, 0))]  # 하루 4칸
    engine_rooms = build_engine_rooms(
        rooms, [date(2026, 8, 1), date(2026, 8, 2)]
    )  # 8칸

    assert auto_slots_per_team(engine_rooms, team_count=3) == 2


def test_slots_per_team_is_rejected_when_no_team_can_get_a_slot() -> None:
    rooms = [_room(1, "1번방", time(18, 0), time(19, 0))]  # 2칸
    engine_rooms = build_engine_rooms(rooms, [date(2026, 8, 1)])

    with pytest.raises(ValueError, match="한 칸도"):
        auto_slots_per_team(engine_rooms, team_count=3)


def test_slots_per_team_is_rejected_when_there_are_no_teams() -> None:
    rooms = [_room(1, "1번방", time(18, 0), time(20, 0))]
    engine_rooms = build_engine_rooms(rooms, [date(2026, 8, 1)])

    with pytest.raises(ValueError, match="배정할 팀이 없습니다"):
        auto_slots_per_team(engine_rooms, team_count=0)


def test_two_people_with_the_same_name_stay_separate() -> None:
    # 동명이인은 저장소 번호로만 갈린다. 이름은 엔진에 가지 않는다.
    engine_teams = build_engine_teams(
        [10, 20], {10: [1], 20: [2]}, unavailable_by_member={}
    )

    assert engine_teams[0].members[0].id == 1
    assert engine_teams[1].members[0].id == 2


def test_the_same_person_in_two_teams_keeps_one_number() -> None:
    engine_teams = build_engine_teams(
        [10, 20], {10: [1], 20: [1]}, unavailable_by_member={}
    )

    assert engine_teams[0].members[0].id == engine_teams[1].members[0].id


def test_unavailable_times_follow_the_person_into_every_team() -> None:
    blocked = [
        TimeInterval(
            start=datetime(2026, 8, 1, 19, 0), end=datetime(2026, 8, 1, 20, 0)
        )
    ]
    engine_teams = build_engine_teams(
        [10, 20], {10: [1], 20: [1]}, unavailable_by_member={1: blocked}
    )

    assert engine_teams[0].members[0].unavailable == blocked
    assert engine_teams[1].members[0].unavailable == blocked
