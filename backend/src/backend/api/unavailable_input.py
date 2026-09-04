from datetime import date, datetime

from backend.scheduling.pipeline import TimeInterval, generate_slots


def require_valid_slot_bounds(starts_at: datetime, ends_at: datetime) -> None:
    """TimeInterval·generate_slots 가 이미 하는 시간대·순서·30분 격자 검증을 그대로 쓴다.

    슬라이스 결과는 쓰지 않는다 — 여기서는 검증만 필요하다.
    """
    generate_slots(TimeInterval(start=starts_at, end=ends_at))


def require_repeat_until_only_when_weekly(
    repeats_weekly: bool, repeat_until: date | None
) -> None:
    if not repeats_weekly and repeat_until is not None:
        raise ValueError("매주 반복이 아니면 반복 종료일을 넣을 수 없습니다")
