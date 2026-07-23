from datetime import date, datetime, time

import pytest

from backend.api.period_input import (
    auto_slots_per_team,
    build_engine_rooms,
    dates_in_period,
    expand_unavailable,
    room_key,
)
from backend.db.models import Room, UnavailableTime

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

    engine_rooms, room_id_by_key, room_name_by_key = build_engine_rooms(rooms, days)

    assert [r.name for r in engine_rooms] == [
        "1번방 (2026-08-01)",
        "1번방 (2026-08-02)",
    ]
    assert engine_rooms[0].open_period.start == datetime(2026, 8, 1, 18, 0)
    assert engine_rooms[0].open_period.end == datetime(2026, 8, 1, 20, 0)
    assert room_id_by_key == {
        "1번방 (2026-08-01)": 7,
        "1번방 (2026-08-02)": 7,
    }
    assert set(room_name_by_key.values()) == {"1번방"}


def test_room_key_collision_is_rejected() -> None:
    rooms = [
        _room(1, "1번방", time(18, 0), time(20, 0)),
        _room(2, "1번방 (2026-08-01)", time(18, 0), time(20, 0)),
    ]

    with pytest.raises(ValueError, match="겹칩니다"):
        build_engine_rooms(rooms, [date(2026, 8, 1)])


def test_slots_per_team_is_the_whole_grid_divided_by_team_count() -> None:
    rooms = [_room(1, "1번방", time(18, 0), time(20, 0))]  # 하루 4칸
    engine_rooms, _, _ = build_engine_rooms(
        rooms, [date(2026, 8, 1), date(2026, 8, 2)]
    )  # 8칸

    assert auto_slots_per_team(engine_rooms, team_count=3) == 2


def test_slots_per_team_is_rejected_when_no_team_can_get_a_slot() -> None:
    rooms = [_room(1, "1번방", time(18, 0), time(19, 0))]  # 2칸
    engine_rooms, _, _ = build_engine_rooms(rooms, [date(2026, 8, 1)])

    with pytest.raises(ValueError, match="한 칸도"):
        auto_slots_per_team(engine_rooms, team_count=3)
