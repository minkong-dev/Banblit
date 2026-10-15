# validation 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api와 다른 service 모듈은 이 모듈 안의 다른 파일을 직접 import 하지 않고 이 파일만 참조합니다.
# 아이디, 비밀번호, 기수, 반복 횟수의 범위처럼 운영자가 조절하는 값은 이 파일에만 둡니다.
# 화면(frontend/src/lib/validate.ts)이 같은 값을 참조하므로 수정하면 그 파일도 같은 작업 안에서 수정합니다.

from datetime import date

from backend.services.validation import input as rules
from backend.services.validation.input import (
    format_calendar_date,
    format_clock,
    format_created_at,
    parse_calendar_date,
    parse_clock,
    require_clock_range,
    require_department,
    require_email,
    require_ends_not_before_starts,
    require_non_empty,
    require_on_the_hour,
    require_person_name,
    require_reject_reason,
    require_repeat_weekdays,
    require_student_no,
    require_valid_kind,
    require_valid_slot_bounds,
    require_within_room_window,
)

LOGIN_ID_MIN_LENGTH = 4
LOGIN_ID_MAX_LENGTH = 20
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 20
# 기수의 최댓값입니다. 1981년이 1기라 2026년은 46기입니다. 오타로 입력된 큰 수는 거부합니다.
MAX_COHORT = 100
# 반복 횟수의 상한입니다. 하루 한 번씩이라도 5년을 넘기지 않게 합니다.
MAX_REPEAT_COUNT = 365 * 5


def require_login_id(value: str) -> str:
    return rules.require_login_id(value, LOGIN_ID_MIN_LENGTH, LOGIN_ID_MAX_LENGTH)


def require_password(value: str) -> None:
    rules.require_password(value, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)


def require_cohort(value: int) -> int:
    return rules.require_cohort(value, MAX_COHORT)


def require_repeat_end(repeat_weekdays: int | None, repeat_count: int | None, repeat_until: date | None) -> None:
    rules.require_repeat_end(repeat_weekdays, repeat_count, repeat_until, MAX_REPEAT_COUNT)


__all__ = [
    "LOGIN_ID_MAX_LENGTH",
    "LOGIN_ID_MIN_LENGTH",
    "MAX_COHORT",
    "MAX_REPEAT_COUNT",
    "PASSWORD_MAX_LENGTH",
    "PASSWORD_MIN_LENGTH",
    "format_calendar_date",
    "format_clock",
    "format_created_at",
    "parse_calendar_date",
    "parse_clock",
    "require_clock_range",
    "require_cohort",
    "require_department",
    "require_email",
    "require_ends_not_before_starts",
    "require_login_id",
    "require_non_empty",
    "require_on_the_hour",
    "require_password",
    "require_person_name",
    "require_reject_reason",
    "require_repeat_end",
    "require_repeat_weekdays",
    "require_student_no",
    "require_valid_kind",
    "require_valid_slot_bounds",
    "require_within_room_window",
]
