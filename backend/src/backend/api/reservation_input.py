from datetime import datetime, time

from backend.scheduling.pipeline import TimeInterval, generate_slots


def require_valid_slot_bounds(starts_at: datetime, ends_at: datetime) -> None:
    """TimeInterval·generate_slots 가 이미 하는 시간대·순서·30분 격자 검증을 그대로 쓴다."""
    generate_slots(TimeInterval(start=starts_at, end=ends_at))


def require_same_day(starts_at: datetime, ends_at: datetime) -> None:
    if starts_at.date() != ends_at.date():
        raise ValueError("예약은 하루 안에서만 할 수 있습니다")


def require_within_room_hours(
    opens_at: time, closes_at: time, starts_at: datetime, ends_at: datetime
) -> None:
    if starts_at.time() < opens_at or ends_at.time() > closes_at:
        raise ValueError("합주실 운영 시간 안에서만 예약할 수 있습니다")
