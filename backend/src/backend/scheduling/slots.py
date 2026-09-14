from datetime import datetime, timedelta

from backend.scheduling.interval import TimeInterval

# slot(1시간 단위 시간 칸)은 정시에서만 시작합니다. 정시를 벗어나는 시간은
# 인정하지 않습니다.
SLOT_MINUTES = 60


def _is_on_grid(moment: datetime) -> bool:
    return moment.minute == 0 and moment.second == 0 and moment.microsecond == 0


def generate_slots(period: TimeInterval) -> list[TimeInterval]:
    """운영 시간 구간을 1시간 slot(1시간 단위 시간 칸)으로 분할합니다.

    운영 시간은 정시에서 시작하고 끝나야 합니다.
    정시 격자를 벗어나면 남은 시간을 버리지 않고 잘못된 설정으로 거부합니다.
    """
    if not _is_on_grid(period.start):
        raise ValueError("운영 시간은 정시에서 시작해야 합니다")
    if not _is_on_grid(period.end):
        raise ValueError("운영 시간은 정시에서 끝나야 합니다")

    unit = timedelta(minutes=SLOT_MINUTES)
    slots: list[TimeInterval] = []
    current = period.start
    while current + unit <= period.end:
        slots.append(TimeInterval(start=current, end=current + unit))
        current += unit
    return slots
