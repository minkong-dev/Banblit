from datetime import datetime


def require_non_empty(value: str, field_label: str) -> str:
    """빈 문자열·공백만 있는 문자열을 거절하고, 앞뒤 공백을 뗀 값을 돌려준다."""
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{field_label}을 입력해 주세요")
    return trimmed


def format_created_at(value: datetime) -> str:
    """시간대 없는 시각을 "YYYY-MM-DDTHH:MM:SS" 로 바꾼다. 초 미만은 버린다."""
    return value.isoformat(timespec="seconds")
