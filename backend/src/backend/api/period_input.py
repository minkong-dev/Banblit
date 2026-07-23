from datetime import date, datetime, time, timedelta

from backend.db.models import UnavailableTime
from backend.scheduling.interval import TimeInterval

WEEK = timedelta(days=7)


def dates_in_period(starts_on: date, ends_on: date) -> list[date]:
    """기간의 시작일부터 종료일까지, 양 끝을 포함한 날짜 목록."""
    span = (ends_on - starts_on).days
    return [starts_on + timedelta(days=offset) for offset in range(span + 1)]


def expand_unavailable(
    rows: list[UnavailableTime],
    window_start: datetime,
    window_end: datetime,
) -> list[TimeInterval]:
    """불가능시간을 기간 안에 실제로 걸리는 구간들로 풀어낸다.

    매주 반복이면 7일 간격으로 되풀이하되, 반복 종료일이 있으면 그 날짜까지만 만든다.
    기간과 조금도 겹치지 않는 구간은 버린다 — 엔진에 넘겨도 아무 영향이 없다.
    """
    expanded: list[TimeInterval] = []
    for row in rows:
        length = row.ends_at - row.starts_at
        for start in _occurrences(row, window_end):
            end = start + length
            if end <= window_start or start >= window_end:
                continue
            expanded.append(TimeInterval(start=start, end=end))
    return expanded


def _occurrences(row: UnavailableTime, window_end: datetime) -> list[datetime]:
    if not bool(row.repeats_weekly):
        return [row.starts_at]

    limit = window_end
    if row.repeat_until is not None:
        # 반복 종료일은 "그 날짜까지"라는 뜻이므로 그날의 끝까지 인정한다.
        limit = min(limit, datetime.combine(row.repeat_until + timedelta(days=1), time()))

    starts: list[datetime] = []
    current = row.starts_at
    while current < limit:
        starts.append(current)
        current += WEEK
    return starts
