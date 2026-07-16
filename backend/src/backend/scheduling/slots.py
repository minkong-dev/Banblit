from datetime import timedelta

from backend.scheduling.interval import TimeInterval


def generate_slots(period: TimeInterval, unit_minutes: int) -> list[TimeInterval]:
    """운영 시간 구간을 unit_minutes 길이의 연속된 슬롯으로 쪼갠다."""
    if unit_minutes <= 0:
        raise ValueError("unit_minutes must be positive")
    unit = timedelta(minutes=unit_minutes)
    slots: list[TimeInterval] = []
    current = period.start
    while current + unit <= period.end:
        slots.append(TimeInterval(start=current, end=current + unit))
        current += unit
    return slots
