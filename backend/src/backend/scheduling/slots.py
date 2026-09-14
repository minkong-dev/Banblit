from datetime import datetime, timedelta

from backend.scheduling.interval import TimeInterval

# 설정에 값이 없던 시절에 쓰던 칸 크기입니다. 지금은 settings.slot_minutes 가 정하고,
# 이 값은 그 설정이 만들어질 때 넣는 기본값입니다
# (migrations/versions/d2f7a08c5e16_slot_minutes_setting.py).
DEFAULT_SLOT_MINUTES = 60


def _is_on_grid(moment: datetime, slot_minutes: int) -> bool:
    return (
        moment.minute % slot_minutes == 0
        and moment.second == 0
        and moment.microsecond == 0
    )


def generate_slots(
    period: TimeInterval, slot_minutes: int = DEFAULT_SLOT_MINUTES
) -> list[TimeInterval]:
    """운영 시간 구간을 slot_minutes 크기의 칸으로 분할합니다.

    시작과 끝이 그 크기의 격자 위에 있어야 합니다. 격자를 벗어나면 남은 시간을 버리지 않고
    잘못된 설정으로 거부합니다.

    slot_minutes 는 60 의 약수라서 정시가 항상 격자 위에 있습니다. 그래서 분만 보면 되고
    하루의 시작부터 세어 볼 필요가 없습니다(settings table 의 CHECK 가 이를 보장합니다).
    """
    # 60분이면 "정시"가 사람이 읽기에 자연스럽습니다. 그보다 작은 값일 때만 분을 적습니다.
    unit_text = "정시" if slot_minutes == 60 else f"{slot_minutes}분 단위"
    if not _is_on_grid(period.start, slot_minutes):
        raise ValueError(f"운영 시간은 {unit_text}에 시작해야 합니다")
    if not _is_on_grid(period.end, slot_minutes):
        raise ValueError(f"운영 시간은 {unit_text}에 끝나야 합니다")

    unit = timedelta(minutes=slot_minutes)
    slots: list[TimeInterval] = []
    current = period.start
    while current + unit <= period.end:
        slots.append(TimeInterval(start=current, end=current + unit))
        current += unit
    return slots
