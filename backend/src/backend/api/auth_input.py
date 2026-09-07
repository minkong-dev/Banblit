import re

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PASSWORD_MIN_LENGTH = 8


# 기수의 위 끝. 실제로 있을 수 있는 값보다 넉넉히 두되, 오타로 들어온 큰 수는 막는다.
MAX_COHORT = 200


def require_name(value: str) -> str:
    """빈 이름·공백만 있는 이름을 거절하고, 앞뒤 공백을 뗀 이름을 돌려준다."""
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("이름을 입력해 주세요")
    return trimmed


def require_email(value: str) -> str:
    """골뱅이 앞뒤에 공백 없는 글자가 있고, 점 뒤가 두 글자 이상이어야 한다."""
    trimmed = value.strip()
    if not EMAIL_PATTERN.match(trimmed):
        raise ValueError("이메일 형식이 올바르지 않습니다")
    return trimmed


def require_cohort(value: int) -> int:
    """기수. 1981년이 1기이고 해마다 하나씩 오르지만, 여기서는 연도로 환산하지 않고
    숫자만 받는다 — 명단에 적힌 기수를 그대로 담기 위해서다."""
    if value < 1 or value > MAX_COHORT:
        raise ValueError(f"기수는 1에서 {MAX_COHORT} 사이여야 합니다")
    return value


def require_password(value: str) -> None:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError("비밀번호는 8자 이상이어야 합니다")
