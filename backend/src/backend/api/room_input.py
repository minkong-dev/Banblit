from datetime import datetime, time

CLOCK_FORMAT = "%H:%M"


def parse_clock(value: str, field_label: str) -> time:
    """"HH:MM" 문자열을 시각으로 바꾼다. 형식이 아니면 사람이 읽을 문장으로 거절한다."""
    try:
        return datetime.strptime(value, CLOCK_FORMAT).time()
    except ValueError as error:
        raise ValueError(f"{field_label}은 HH:MM 형식이어야 합니다") from error


def format_clock(value: time) -> str:
    return value.strftime(CLOCK_FORMAT)


def require_half_hour_grid(value: time, field_label: str) -> None:
    # DB 의 CheckConstraint(30분·0초 격자)와 같은 규칙을 경계에서 먼저 본다 —
    # 어겨도 DB 오류가 아니라 사람이 읽을 문장으로 거절한다.
    if value.minute not in (0, 30) or value.second != 0:
        raise ValueError(f"{field_label}은 30분 단위여야 합니다")


def require_closes_after_opens(opens_at: time, closes_at: time) -> None:
    if closes_at <= opens_at:
        raise ValueError("닫는 시각은 여는 시각보다 늦어야 합니다")


def require_room_name(name: str) -> str:
    """빈 이름·공백만 있는 이름을 거절하고, 앞뒤 공백을 뗀 이름을 돌려준다.

    화면(roomNameMessage)이 앞뒤 공백만 다른 이름도 같은 이름으로 보므로, 서버도
    저장 전에 공백을 떼어 두 쪽의 중복 판정이 어긋나지 않게 한다.
    """
    trimmed = name.strip()
    if not trimmed:
        raise ValueError("합주실 이름을 입력해 주세요")
    return trimmed
