from datetime import datetime, timedelta

from backend.scheduling.interval import TimeInterval

# 설정에 값이 없던 시절에 쓰던 칸 크기입니다. 지금은 settings.slot_minutes 가 결정하고,
# 이 값은 그 설정이 만들어질 때 넣는 기본값입니다
# (migrations/versions/d2f7a08c5e16_slot_minutes_setting.py).
DEFAULT_SLOT_MINUTES = 60

# 점유 단위로 선택할 수 있는 값입니다. 전부 60 의 약수라 정시가 언제나 격자 위에 있습니다.
# 6 은 60 의 약수지만 제외합니다 — 합주실을 6분 단위로 예약하는 경우가 없습니다.
#
# 이 목록이 정본입니다. API(api/schemas.py), DB CHECK 제약(db/models.py), 화면
# (frontend/src/lib/settings.ts 의 SLOT_MINUTE_CHOICES)이 같은 값을 사용해야 합니다.
# 2026-09-19 이전에는 DB 만 6 을 허용해, DB 를 직접 수정하면 화면이 표시하지 못하는 값이
# 저장될 수 있었습니다.
SLOT_MINUTE_CHOICES: tuple[int, ...] = (5, 10, 12, 15, 20, 30, 60)

# 합주 1회가 진행되는 길이(분)입니다. 칸 하나의 크기와는 다른 값입니다 — 칸은 합주를 "시작할 수 있는
# 간격"이고, 이 값은 "한 번 시작하면 몇 분 동안 이어지는지"입니다. 30분 격자에 60분 합주면
# 18:00·18:30·19:00 어디서든 시작해 1시간 뒤에 끝납니다.
DEFAULT_SESSION_MINUTES = 60

# 합주 1회 길이의 상한(분)입니다. 이보다 긴 합주는 한 번에 진행하지 않습니다. 상한이 없으면
# 하루 운영 시간보다 긴 값이 저장되어, 배정할 수 있는 자리가 하나도 없는 설정이 조용히 만들어집니다.
MAX_SESSION_MINUTES = 240


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
