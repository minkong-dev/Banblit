"""경계에서 입력을 거르는 검사. 어긴 것은 사람이 읽을 문장의 ValueError 로 거절한다.

표마다 따로 두지 않는다 — 빈 문자열, "HH:MM", "YYYY-MM-DD", slot 격자는 어느 표든 같다.
"""

import re
from datetime import date, datetime, time

from backend.db.models import PERIOD_KINDS
from backend.scheduling.pipeline import TimeInterval, generate_slots

CLOCK_FORMAT = "%H:%M"
DATE_FORMAT = "%Y-%m-%d"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PASSWORD_MIN_LENGTH = 8
# 기수의 위 끝. 실제로 있을 수 있는 값보다 넉넉히 두되, 오타로 들어온 큰 수는 막는다.
MAX_COHORT = 200


# ── 문자열 ────────────────────────────────────────────────────────────────

def require_non_empty(value: str, field_label: str) -> str:
    """빈 문자열·공백만 있는 문자열을 거절하고, 앞뒤 공백을 뗀 값을 돌려준다.

    화면도 앞뒤 공백만 다른 이름을 같은 이름으로 보므로, 저장 전에 떼어 두 쪽의
    중복 판정이 어긋나지 않게 한다.
    """
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{field_label}을 입력해 주세요")
    return trimmed


def require_email(value: str) -> str:
    """골뱅이 앞뒤에 공백 없는 글자가 있고, 점 뒤가 두 글자 이상이어야 한다."""
    trimmed = value.strip()
    if not EMAIL_PATTERN.match(trimmed):
        raise ValueError("이메일 형식이 올바르지 않습니다")
    return trimmed


def require_password(value: str) -> None:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError("비밀번호는 8자 이상이어야 합니다")


def require_cohort(value: int) -> int:
    """기수. 1981년이 1기이고 해마다 하나씩 오르지만, 연도로 환산하지 않고 숫자만 받는다."""
    if value < 1 or value > MAX_COHORT:
        raise ValueError(f"기수는 1에서 {MAX_COHORT} 사이여야 합니다")
    return value


def require_valid_kind(kind: str) -> None:
    if kind not in PERIOD_KINDS:
        raise ValueError("kind는 open 또는 focused여야 합니다")


# ── 시각·날짜 ─────────────────────────────────────────────────────────────

def parse_clock(value: str, field_label: str) -> time:
    """"HH:MM" 문자열을 시각으로 바꾼다. 형식이 아니면 사람이 읽을 문장으로 거절한다."""
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


def format_created_at(value: datetime) -> str:
    """시간대 없는 시각을 "YYYY-MM-DDTHH:MM:SS" 로 바꾼다. 초 미만은 버린다."""
    return value.isoformat(timespec="seconds")


def require_on_the_hour(value: time, field_label: str) -> None:
    # DB 의 CheckConstraint(정시 격자)와 같은 규칙을 경계에서 먼저 본다 —
    # 어겨도 DB 오류가 아니라 사람이 읽을 문장으로 거절한다.
    if value.minute != 0 or value.second != 0:
        raise ValueError(f"{field_label}은 정시여야 합니다")


def require_closes_after_opens(opens_at: time, closes_at: time) -> None:
    if closes_at <= opens_at:
        raise ValueError("닫는 시각은 여는 시각보다 늦어야 합니다")


def require_ends_not_before_starts(starts_on: date, ends_on: date) -> None:
    if ends_on < starts_on:
        raise ValueError("종료일은 시작일보다 빠를 수 없습니다")


# ── 구간 ─────────────────────────────────────────────────────────────────

def require_valid_slot_bounds(starts_at: datetime, ends_at: datetime) -> None:
    """TimeInterval·generate_slots 가 이미 하는 시간대·순서·slot 격자 검증을 그대로 쓴다."""
    generate_slots(TimeInterval(start=starts_at, end=ends_at))


def require_same_day(starts_at: datetime, ends_at: datetime) -> None:
    if starts_at.date() != ends_at.date():
        raise ValueError("예약은 하루 안에서만 할 수 있습니다")


def require_within_room_hours(
    opens_at: time, closes_at: time, starts_at: datetime, ends_at: datetime
) -> None:
    if starts_at.time() < opens_at or ends_at.time() > closes_at:
        raise ValueError("합주실 운영 시간 안에서만 예약할 수 있습니다")


def require_repeat_until_only_when_weekly(
    repeats_weekly: bool, repeat_until: date | None
) -> None:
    if not repeats_weekly and repeat_until is not None:
        raise ValueError("매주 반복이 아니면 반복 종료일을 넣을 수 없습니다")
