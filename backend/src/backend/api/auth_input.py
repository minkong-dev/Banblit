import re

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PASSWORD_MIN_LENGTH = 8


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


def require_password(value: str) -> None:
    if len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError("비밀번호는 8자 이상이어야 합니다")
