from datetime import datetime, timedelta

from backend.scheduling.interval import TimeInterval

# 칸은 정시와 30분에서만 시작한다. 이 격자를 벗어나는 시간은 인정하지 않는다.
SLOT_MINUTES = 30


def _is_on_grid(moment: datetime) -> bool:
    return (
        moment.minute in (0, SLOT_MINUTES)
        and moment.second == 0
        and moment.microsecond == 0
    )


def generate_slots(period: TimeInterval) -> list[TimeInterval]:
    """운영 시간 구간을 30분짜리 칸으로 쪼갠다.

    운영 시간은 정시 또는 30분에서 시작하고 끝나야 한다.
    격자를 벗어나면 자투리를 버리지 않고 잘못된 설정으로 거부한다.
    """
    if period.end <= period.start:
        raise ValueError("운영 시간의 끝은 시작보다 뒤여야 합니다")
    if not _is_on_grid(period.start):
        raise ValueError("운영 시간은 정시 또는 30분에서 시작해야 합니다")
    if not _is_on_grid(period.end):
        raise ValueError("운영 시간은 정시 또는 30분에서 끝나야 합니다")

    unit = timedelta(minutes=SLOT_MINUTES)
    slots: list[TimeInterval] = []
    current = period.start
    while current + unit <= period.end:
        slots.append(TimeInterval(start=current, end=current + unit))
        current += unit
    return slots
