from datetime import date, datetime, time

CLOCK_FORMAT = "%H:%M"
DATE_FORMAT = "%Y-%m-%d"
VALID_KINDS = ("open", "focused")


def parse_clock(value: str, field_label: str) -> time:
    """"HH:MM" 문자열을 시각으로 바꾼다. 격자 제약은 없다 — 하루 2회 연산 시각일 뿐이다."""
    try:
        return datetime.strptime(value, CLOCK_FORMAT).time()
    except ValueError as error:
        raise ValueError(f"{field_label}은 HH:MM 형식이어야 합니다") from error


def format_clock(value: time) -> str:
    return value.strftime(CLOCK_FORMAT)


def parse_calendar_date(value: str, field_label: str) -> date:
    try:
        return datetime.strptime(value, DATE_FORMAT).date()
    except ValueError as error:
        raise ValueError(f"{field_label}은 YYYY-MM-DD 형식이어야 합니다") from error


def format_calendar_date(value: date) -> str:
    return value.strftime(DATE_FORMAT)


def require_valid_kind(kind: str) -> None:
    if kind not in VALID_KINDS:
        raise ValueError("kind는 open 또는 focused여야 합니다")


def require_ends_not_before_starts(starts_on: date, ends_on: date) -> None:
    if ends_on < starts_on:
        raise ValueError("종료일은 시작일보다 빠를 수 없습니다")
