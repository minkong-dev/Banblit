from datetime import date, datetime

from backend.api.period_input import dates_in_period, expand_unavailable
from backend.db.models import UnavailableTime

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
