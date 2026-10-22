"""경계에서 입력을 검증합니다. 위반한 값은 사람이 읽을 수 있는 문장을 담은 ValueError 로 거부합니다.

table(데이터베이스의 행과 열로 이루어진 데이터 구조)마다 따로 두지 않습니다. 빈 문자열, "HH:MM",
"YYYY-MM-DD", slot(점유 단위 길이의 시간 칸) 격자 검증은 어느 table 이든 같습니다.
"""

import re
from datetime import date, datetime, time, timedelta

from backend.contract import LATEST_CLOSE_NEXT_DAY, PERIOD_KINDS, REJECT_REASON_MAX_LENGTH
from backend.scheduling.pipeline import TimeInterval, day_window, generate_slots

CLOCK_FORMAT = "%H:%M"
DATE_FORMAT = "%Y-%m-%d"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
# 이메일과 비밀번호가 받는 글자입니다. 눈에 보이는 ASCII 문자(공백부터 물결표까지)만 허용합니다.
# 한글은 메일 서버가 SMTPUTF8 을 지원해야 전달되고, 제어문자는 헤더, 기록에 보이지 않는 채로
# 남습니다. 화면(validate.ts 의 ASCII_ONLY)도 같은 범위를 참조합니다.
PRINTABLE_ASCII = re.compile(r"^[\x20-\x7E]*$")
# 로그인 아이디입니다. 영어 소문자와 숫자만 허용합니다. 화면(validate.ts 의 loginIdMessage)도
# 같은 규칙을 참조합니다. 길이는 require_login_id 가 따로 검사합니다.
LOGIN_ID_PATTERN = re.compile(r"^[a-z0-9]+$")
# 사람 이름과 학과 이름에 쓰는 글자입니다. 한글, 영어 글자와 낱말 사이 공백만 받습니다.
# 화면(validate.ts 의 NAME_LETTERS)도 같은 규칙을 참조합니다.
NAME_PATTERN = re.compile(r"^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$")

# 학과 이름에 쓰는 글자입니다. NAME_PATTERN 과 같습니다. 화면(validate.ts 의 departmentMessage)도 같은 규칙을 참조합니다.
DEPARTMENT_PATTERN = NAME_PATTERN

# 비밀번호에 쓸 수 있는 특수문자입니다. 주소, 질의문, 명령줄에서 따로 처리해야 하는
# 글자(따옴표, 역슬래시, 역따옴표, 꺾쇠, 수직선, 빗금, 물결, 공백)는 포함하지 않습니다.
# 화면(validate.ts 의 PASSWORD_SYMBOLS)도 같은 목록을 참조합니다.
PASSWORD_SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?"
# 학번은 숫자 8자리입니다. 화면(validate.ts의 studentNoMessage)도 같은 규칙을 참조합니다.
# 숫자 클래스(역슬래시 d) 대신 [0-9]를 사용합니다 — 파이썬의 숫자 클래스는 전각 숫자(１２３４)까지 받기 때문입니다.
STUDENT_NO_PATTERN = re.compile(r"^[0-9]{8}$")


# ── 문자열 ────────────────────────────────────────────────────────────────

def require_non_empty(value: str, field_label: str) -> str:
    """빈 문자열, 공백만 있는 문자열을 거부하고, 앞뒤 공백을 제거한 값을 반환합니다.

    화면도 앞뒤 공백만 다른 이름을 같은 이름으로 보므로, 저장 전에 제거하여 두 쪽의
    중복 판정이 어긋나지 않게 합니다.
    """
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{field_label}을 입력해 주세요")
    return trimmed


def require_email(value: str) -> str:
    """@ 앞뒤에 공백 없는 문자가 있고, 도메인이 두 글자 이상이어야 합니다.

    한글과 제어문자는 거부합니다(PRINTABLE_ASCII). 한글 주소는 메일 서버끼리 SMTPUTF8 을
    지원해야 전달되고, 제어문자는 To 헤더와 기록에 보이지 않는 채로 남습니다.
    """
    trimmed = value.strip()
    if not PRINTABLE_ASCII.match(trimmed):
        raise ValueError("이메일은 영문, 숫자, 기호만 사용할 수 있어요")
    if not EMAIL_PATTERN.match(trimmed):
        raise ValueError("이메일 형식이 올바르지 않아요")
    return trimmed


def require_reject_reason(value: str) -> str:
    """반려 사유입니다. 앞뒤 공백을 제거하고, 비었거나 REJECT_REASON_MAX_LENGTH 자를 넘으면 거부합니다."""
    trimmed = require_non_empty(value, "반려 사유")
    if len(trimmed) > REJECT_REASON_MAX_LENGTH:
        raise ValueError(f"반려 사유는 {REJECT_REASON_MAX_LENGTH}자 이하로 입력해주세요")
    return trimmed


def require_login_id(value: str, min_length: int, max_length: int) -> str:
    """로그인 아이디입니다. 앞뒤 공백을 제거하고 소문자로 변환한 뒤 글자 종류와 길이(min_length 이상 max_length 이하)를 검증합니다.

    화면도 같은 방식(strip + lowercase)으로 정규화한 값을 비교, 전송하므로, 대문자를 섞어
    입력해도 같은 아이디로 로그인할 수 있습니다.
    """
    normalized = value.strip().lower()
    if not LOGIN_ID_PATTERN.match(normalized):
        raise ValueError("아이디는 영어 소문자와 숫자만 사용 가능해요")
    if not min_length <= len(normalized) <= max_length:
        raise ValueError(f"아이디는 {min_length}자 이상 {max_length}자 이하로 입력해주세요")
    return normalized


def require_person_name(value: str) -> str:
    """사람 이름입니다. 앞뒤 공백을 제거하고, 한글, 영어 글자와 낱말 사이 공백만 허용합니다."""
    trimmed = require_non_empty(value, "이름")
    if not NAME_PATTERN.match(trimmed):
        raise ValueError("이름은 한글과 영어만 사용 가능해요")
    return trimmed


def require_department(value: str) -> str:
    """학과입니다. 앞뒤 공백을 제거하고, 한글, 영어 글자와 낱말 사이 공백만 허용합니다."""
    trimmed = require_non_empty(value, "학과")
    if not DEPARTMENT_PATTERN.match(trimmed):
        raise ValueError("학과는 한글과 영어만 사용 가능해요")
    return trimmed


def require_student_no(value: str) -> str:
    """학번입니다. 숫자 8자리가 아니면 거부하고, 앞뒤 공백을 제거한 값을 반환합니다."""
    trimmed = value.strip()
    if not STUDENT_NO_PATTERN.match(trimmed):
        raise ValueError("학번은 숫자 8자리여야 해요")
    return trimmed


# 비밀번호가 충족해야 할 규칙입니다. 왼쪽이 검증 조건, 오른쪽이 위반했을 때 사용자에게 보일 메시지입니다.
# 가입, 비밀번호 재설정, 비밀번호 변경이 모두 이 규칙을 사용합니다.
# 화면의 같은 규칙은 frontend/src/lib/validate.ts 에 있습니다.
PASSWORD_RULES: tuple[tuple[str, str], ...] = (
    (r"[a-z]", "비밀번호에는 소문자가 하나 이상 있어야 해요"),
    (r"[A-Z]", "비밀번호에는 대문자가 하나 이상 있어야 해요"),
    (r"[0-9]", "비밀번호에는 숫자가 하나 이상 있어야 해요"),
    (f"[{re.escape(PASSWORD_SYMBOLS)}]", "비밀번호에는 특수기호가 하나 이상 있어야 해요"),
)

# 목록에 없는 글자를 찾아내는 규칙입니다. 영어 글자, 숫자, 위 특수문자 외에는 전부 거부합니다.
PASSWORD_ALLOWED = re.compile(f"^[A-Za-z0-9{re.escape(PASSWORD_SYMBOLS)}]*$")


def require_password(value: str, min_length: int, max_length: int) -> None:
    """새로 설정하는 비밀번호의 글자와 길이(min_length 이상 max_length 이하)를 검증합니다. 로그인은 이 함수를 호출하지 않습니다.
    규칙을 변경하기 전에 생성된 계정이 로그인할 수 없어서는 안 되기 때문입니다."""
    # 쓸 수 있는 글자를 목록으로 지정해, 목록 밖의 글자(한글 포함)는 종류와 관계없이 거부합니다.
    if not PRINTABLE_ASCII.match(value):
        raise ValueError("비밀번호는 영문, 숫자, 기호만 사용할 수 있어요")
    if not PASSWORD_ALLOWED.match(value):
        raise ValueError(f"특수문자는 {' '.join(PASSWORD_SYMBOLS)} 만 사용 가능해요")
    if not min_length <= len(value) <= max_length:
        raise ValueError(f"비밀번호는 {min_length}자에서 {max_length}자 사이여야 해요")
    for pattern, message in PASSWORD_RULES:
        if not re.search(pattern, value):
            raise ValueError(message)


def require_cohort(value: int, max_cohort: int) -> int:
    """기수입니다. 1 이상 max_cohort 이하만 받습니다. 연도로 환산하지 않고 숫자만 받습니다."""
    if value < 1 or value > max_cohort:
        raise ValueError(f"기수는 1에서 {max_cohort} 사이여야 해요")
    return value


def require_valid_kind(kind: str) -> None:
    if kind not in PERIOD_KINDS:
        raise ValueError("kind 는 open 또는 focused 여야 해요")


# ── 시각, 날짜 ─────────────────────────────────────────────────────────────

def parse_clock(value: str, field_label: str) -> time:
    """"HH:MM" 문자열을 시각으로 변환합니다. 형식이 아닐 경우 사용자가 읽을 문장으로 거부합니다."""
    try:
        return datetime.strptime(value, CLOCK_FORMAT).time()
    except ValueError as error:
        raise ValueError(f"{field_label}은 HH:MM 형식이어야 해요") from error


def format_clock(value: time) -> str:
    return value.strftime(CLOCK_FORMAT)


def parse_calendar_date(value: str, field_label: str) -> date:
    try:
        return datetime.strptime(value, DATE_FORMAT).date()
    except ValueError as error:
        raise ValueError(f"{field_label}은 YYYY-MM-DD 형식이어야 해요") from error


def format_calendar_date(value: date) -> str:
    return value.strftime(DATE_FORMAT)


def format_created_at(value: datetime) -> str:
    """시간대 없는 시각을 "YYYY-MM-DDTHH:MM:SS"로 변환합니다. 초 단위 이하는 제거합니다."""
    return value.isoformat(timespec="seconds")


def require_on_the_hour(value: time, field_label: str) -> None:
    # DB의 CheckConstraint(정시 시간 단위 격자)와 같은 규칙을 경계에서 먼저 검증합니다 —
    # 위반해도 DB 오류가 아니라 사용자가 읽을 문장으로 거부합니다.
    if value.minute != 0 or value.second != 0:
        raise ValueError(f"{field_label}은 정시여야 해요")


def require_clock_range(starts: time, ends: time, label: str) -> None:
    """하루 중의 범위 1개를 검증합니다. ends 가 starts 보다 이르면 LATEST_CLOSE_NEXT_DAY(다음 날 00:00)만 허용합니다."""
    if ends == starts:
        raise ValueError(f"{label}의 시작 시간과 종료 시간은 같을 수 없어요")
    if ends < starts and ends != time.fromisoformat(LATEST_CLOSE_NEXT_DAY):
        raise ValueError(f"{label}의 종료 시간은 시작 시간보다 늦거나 {LATEST_CLOSE_NEXT_DAY} 이어야 해요")


def require_ends_not_before_starts(starts_on: date, ends_on: date) -> None:
    if ends_on < starts_on:
        raise ValueError("종료일은 시작일보다 빠를 수 없어요")


# ── 구간 ─────────────────────────────────────────────────────────────────

def require_valid_slot_bounds(
    starts_at: datetime, ends_at: datetime, slot_minutes: int
) -> None:
    """TimeInterval, generate_slots 이 이미 수행하는 시간대, 순서, 격자 검증을 재사용합니다.

    slot_minutes 는 저장소 설정이 결정하는 칸 하나의 크기(분)입니다.
    """
    generate_slots(TimeInterval(start=starts_at, end=ends_at), slot_minutes)


def require_within_room_window(
    opens_at: time, closes_at: time, starts_at: datetime, ends_at: datetime
) -> None:
    """starts_at 날짜 또는 그 전날의 합주실 운영 시간 중 하나가 예약 구간 전체를 포함하지 않으면 거부합니다.

    전날을 함께 보는 이유는 00:00 에 마감하는 합주실의 운영 시간이 다음 날 00:00 까지이기 때문입니다.
    """
    for day in (starts_at.date(), starts_at.date() - timedelta(days=1)):
        window = day_window(day, opens_at, closes_at)
        if window.start <= starts_at and ends_at <= window.end:
            return
    raise ValueError("합주실 운영 시간 안에서만 예약할 수 있어요")


# 요일 집합이 가질 수 있는 최댓값입니다. 월요일 1 부터 일요일 64 까지 일곱 개를 전부 더한 값입니다.
ALL_WEEKDAYS = 0b1111111


def require_repeat_weekdays(value: int | None) -> int | None:
    """반복할 요일의 집합입니다. None 이거나 0 이면 반복하지 않습니다. 범위 밖이면 거부합니다."""
    if value is None:
        return None
    if value < 0 or value > ALL_WEEKDAYS:
        raise ValueError("반복 요일 값이 올바르지 않아요")
    return value


def require_repeat_end(
    repeat_weekdays: int | None, repeat_count: int | None, repeat_until: date | None, max_count: int
) -> None:
    """반복이 끝나는 조건을 검증합니다. 횟수와 종료일은 동시에 지정할 수 없고, 횟수는 1 이상 max_count 이하입니다."""
    repeating = bool(repeat_weekdays)
    if not repeating and (repeat_count is not None or repeat_until is not None):
        raise ValueError("반복이 아니면 반복 횟수와 반복 종료일을 입력할 수 없어요")
    if repeat_count is not None and repeat_until is not None:
        raise ValueError("반복 횟수와 반복 종료일은 동시에 설정할 수 없어요")
    if repeat_count is not None and (repeat_count < 1 or repeat_count > max_count):
        raise ValueError(f"반복 횟수는 1에서 {max_count} 사이여야 해요")
