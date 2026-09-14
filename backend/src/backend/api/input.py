"""경계에서 입력을 검증합니다. 위반한 것은 사람이 읽을 문장의 ValueError로 거부합니다.

표마다 따로 두지 않습니다 — 빈 문자열, "HH:MM", "YYYY-MM-DD", slot(1시간 단위 시간 칸) 격자는 어느 표든 같습니다.
"""

import re
from datetime import date, datetime, time

from backend.db.models import PERIOD_KINDS
from backend.scheduling.pipeline import TimeInterval, generate_slots

CLOCK_FORMAT = "%H:%M"
DATE_FORMAT = "%Y-%m-%d"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 20
# 기수의 최댓값. 1981년이 1기라 2026년은 46기입니다. 반세기 남짓 여유를 두되, 오타로 들어온
# 큰 수는 거부합니다. 화면(validate.ts의 cohortMessage)도 같은 값을 참조합니다.
MAX_COHORT = 100
# 학번은 숫자 8자리입니다. 화면(validate.ts의 studentNoMessage)도 같은 규칙을 참조합니다.
# 숫자 클래스(역슬래시 d) 대신 [0-9]를 사용합니다 — 파이썬의 숫자 클래스는 전각 숫자(１２３４)까지 받기 때문입니다.
STUDENT_NO_PATTERN = re.compile(r"^[0-9]{8}$")


# ── 문자열 ────────────────────────────────────────────────────────────────

def require_non_empty(value: str, field_label: str) -> str:
    """빈 문자열·공백만 있는 문자열을 거부하고, 앞뒤 공백을 제거한 값을 반환합니다.

    화면도 앞뒤 공백만 다른 이름을 같은 이름으로 보므로, 저장 전에 제거하여 두 쪽의
    중복 판정이 어긋나지 않게 합니다.
    """
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{field_label}을 입력해 주세요")
    return trimmed


def require_email(value: str) -> str:
    """@ 앞뒤에 공백 없는 문자가 있고, 도메인이 두 글자 이상이어야 합니다."""
    trimmed = value.strip()
    if not EMAIL_PATTERN.match(trimmed):
        raise ValueError("이메일 형식이 올바르지 않습니다")
    return trimmed


def require_student_no(value: str) -> str:
    """학번입니다. 숫자 8자리가 아니면 거부하고, 앞뒤 공백을 제거한 값을 반환합니다."""
    trimmed = value.strip()
    if not STUDENT_NO_PATTERN.match(trimmed):
        raise ValueError("학번은 숫자 8자리여야 합니다")
    return trimmed


# 비밀번호가 충족해야 할 규칙입니다. 왼쪽이 검증 조건, 오른쪽이 위반했을 때 사용자에게 보일 메시지입니다.
# 가입·재설정·변경이 모두 이 한 곳을 지나갑니다 — 화면마다 따로 두면 한쪽만 느슨해집니다.
# 화면의 같은 규칙은 frontend/src/lib/validate.ts에 있습니다.
PASSWORD_RULES: tuple[tuple[str, str], ...] = (
    (r"[a-z]", "비밀번호에는 소문자가 하나 이상 있어야 합니다"),
    (r"[A-Z]", "비밀번호에는 대문자가 하나 이상 있어야 합니다"),
    (r"[0-9]", "비밀번호에는 숫자가 하나 이상 있어야 합니다"),
    (r"[^A-Za-z0-9]", "비밀번호에는 특수기호가 하나 이상 있어야 합니다"),
)


def require_password(value: str) -> None:
    """새로 정하는 비밀번호를 검증합니다. 로그인은 이것을 호출하지 않습니다 —
    규칙을 변경하기 전에 생성된 계정이 로그인할 수 없어서는 안 되기 때문입니다."""
    if not PASSWORD_MIN_LENGTH <= len(value) <= PASSWORD_MAX_LENGTH:
        raise ValueError(
            f"비밀번호는 {PASSWORD_MIN_LENGTH}자에서 {PASSWORD_MAX_LENGTH}자 사이여야 합니다"
        )
    for pattern, message in PASSWORD_RULES:
        if not re.search(pattern, value):
            raise ValueError(message)


def require_cohort(value: int) -> int:
    """기수입니다. 1981년이 1기이고 해마다 하나씩 증가하지만, 연도로 환산하지 않고 숫자만 받습니다."""
    if value < 1 or value > MAX_COHORT:
        raise ValueError(f"기수는 1에서 {MAX_COHORT} 사이여야 합니다")
    return value


def require_valid_kind(kind: str) -> None:
    if kind not in PERIOD_KINDS:
        raise ValueError("kind는 open 또는 focused여야 합니다")


# ── 시각·날짜 ─────────────────────────────────────────────────────────────

def parse_clock(value: str, field_label: str) -> time:
    """"HH:MM" 문자열을 시각으로 변환합니다. 형식이 아닐 경우 사용자가 읽을 문장으로 거부합니다."""
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
    """시간대 없는 시각을 "YYYY-MM-DDTHH:MM:SS"로 변환합니다. 초 단위 이하는 제거합니다."""
    return value.isoformat(timespec="seconds")


def require_on_the_hour(value: time, field_label: str) -> None:
    # DB의 CheckConstraint(정시 시간 단위 격자)와 같은 규칙을 경계에서 먼저 검증합니다 —
    # 위반해도 DB 오류가 아니라 사용자가 읽을 문장으로 거부합니다.
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
    """TimeInterval·generate_slots이 이미 수행하는 시간대·순서·slot(1시간 단위 시간 칸) 격자 검증을 재사용합니다."""
    generate_slots(TimeInterval(start=starts_at, end=ends_at))


def require_same_day(starts_at: datetime, ends_at: datetime) -> None:
    if starts_at.date() != ends_at.date():
        raise ValueError("예약은 하루 안에서만 할 수 있습니다")


def require_within_room_hours(
    opens_at: time, closes_at: time, starts_at: datetime, ends_at: datetime
) -> None:
    if starts_at.time() < opens_at or ends_at.time() > closes_at:
        raise ValueError("합주실 운영 시간 안에서만 예약할 수 있습니다")


def require_one_repeat_cycle(repeats_daily: bool, repeats_weekly: bool) -> None:
    """매일과 매주를 동시에 활성화하는 것을 금지합니다. 둘 다 비활성화하면 한 번 일정입니다."""
    if repeats_daily and repeats_weekly:
        raise ValueError("매일 반복과 매주 반복을 함께 켤 수 없습니다")


def require_repeat_until_only_when_repeating(
    repeats_daily: bool, repeats_weekly: bool, repeat_until: date | None
) -> None:
    if not repeats_daily and not repeats_weekly and repeat_until is not None:
        raise ValueError("반복이 아니면 반복 종료일을 넣을 수 없습니다")
