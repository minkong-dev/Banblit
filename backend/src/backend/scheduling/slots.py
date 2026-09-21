from datetime import datetime, timedelta

from backend.contract import DEFAULT_SESSION_MINUTES, DEFAULT_SLOT_MINUTES
from backend.scheduling.interval import TimeInterval


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


def generate_sessions(
    period: TimeInterval,
    slot_minutes: int = DEFAULT_SLOT_MINUTES,
    session_minutes: int = DEFAULT_SESSION_MINUTES,
) -> list[TimeInterval]:
    """운영 시간 구간 안에서 session(합주 1회가 이어지는 구간)이 시작할 수 있는 자리를 전부 반환합니다.

    session 은 칸 격자의 모든 시각에서 시작하므로 앞뒤 session 끼리 겹칩니다. 30분 격자에
    60분 session 이면 18:00·18:30·19:00 이 각각 후보입니다. 겹치는 후보 중 무엇을 배정할지는
    assignment.assign 이 결정합니다.

    끝이 운영 시간을 넘는 후보는 제외합니다. 운영 시간이 session 1회보다 짧으면 빈 목록을 반환합니다.
    """
    if session_minutes % slot_minutes != 0:
        raise ValueError(
            f"합주 1회 길이({session_minutes}분)는 "
            f"칸 크기({slot_minutes}분)의 배수여야 합니다"
        )

    length = timedelta(minutes=session_minutes)
    starts = generate_slots(period, slot_minutes)
    return [
        TimeInterval(start=slot.start, end=slot.start + length)
        for slot in starts
        if slot.start + length <= period.end
    ]
