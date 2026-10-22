# scheduling 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api 와 services 는 scheduling 내의 다른 파일을 직접 호출하지 않고 이 파일만 참조합니다.
#
# 이 모듈 안에서만 쓰는 조절 값은 이 파일이 정의하고, 기능 파일(slots·assignment)은
# 매개변수로 받습니다. 모듈 2개 이상이 참조하는 값(칸 크기·합주 1회 길이)은 backend/contract.py 에
# 있습니다.
import os

from backend.scheduling.assignment import Assignment, Room, RoomInterval
from backend.scheduling.assignment import assign as assign_sessions
from backend.scheduling.availability import Member, Team, absent_member_ids
from backend.scheduling.interval import TimeInterval, day_window
from backend.scheduling.slots import generate_sessions, generate_slots

# solver 계산 1회에 허용하는 시간(초)입니다. 실측 최댓값(약 22초)의 약 3배입니다. 제한이 없으면
# 오래 걸리는 입력 하나가 worker 를 무한정 점유합니다.
SOLVER_TIME_LIMIT_SECONDS = 60.0

# 더 나은 배정안이 이 시간(초) 동안 나오지 않으면 계산을 중단합니다. 이 값이 없으면 계산마다 SOLVER_TIME_LIMIT_SECONDS 를 전부 사용합니다.
STALL_SECONDS = 5.0

# 계산에 쓰는 thread 수의 상한입니다. 배정 계산은 api 와 같은 process 에서 돌므로 코어 전부를 쓰면 일반 요청이 느려집니다. 코어 수의 절반입니다.
SOLVER_WORKERS = max(1, (os.cpu_count() or 2) // 2)


def assign(
    teams: list[Team],
    rooms: list[Room],
    target_sessions: int,
    slot_minutes: int,
    session_minutes: int,
    daily_max_minutes: int | None = None,
    max_consecutive_minutes: int | None = None,
    max_absent: int = 0,
) -> Assignment:
    """teams 를 rooms 에 target_sessions 회까지 배정합니다. 자리가 모자라도 가장 나은 배정안을 반환합니다."""
    # 계산 상한 3개(시간, 멈춤 기준, thread 수)를 이 자리에서 전달합니다. 기능 파일이 값을 직접 들고 있으면 계산 1회의 상한과 멈춤 기준이
    # 서로 다른 파일에 흩어져, 둘의 비율을 한 자리에서 판단할 수 없습니다.
    return assign_sessions(
        teams,
        rooms,
        target_sessions,
        slot_minutes,
        session_minutes,
        SOLVER_TIME_LIMIT_SECONDS,
        STALL_SECONDS,
        daily_max_minutes=daily_max_minutes,
        max_consecutive_minutes=max_consecutive_minutes,
        max_absent=max_absent,
        num_workers=SOLVER_WORKERS,
    )


__all__ = [
    "Assignment",
    "Room",
    "RoomInterval",
    "Member",
    "Team",
    "TimeInterval",
    "day_window",
    "absent_member_ids",
    "assign",
    "generate_slots",
    "generate_sessions",
    "SOLVER_TIME_LIMIT_SECONDS",
    "STALL_SECONDS",
    "SOLVER_WORKERS",
]
