# scheduling 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api 와 services 는 scheduling 내의 다른 파일을 직접 호출하지 않고 이 파일만 참조합니다.
#
# 이 모듈 안에서만 쓰는 조절 값은 이 파일이 정의하고, 기능 파일(slots·assignment·resolution)은
# 매개변수로 받습니다. 모듈 2개 이상이 참조하는 값(칸 크기·합주 1회 길이)은 backend/contract.py 에
# 있습니다.
from backend.scheduling.assignment import Assignment, Room, RoomInterval
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import Resolution
from backend.scheduling.resolution import resolve as resolve_sessions
from backend.scheduling.slots import generate_sessions, generate_slots

# solver 계산 1회에 허용하는 시간(초)입니다. 실측 최댓값(약 22초)의 약 3배입니다. 제한이 없으면
# 풀리지 않는 입력 하나가 worker 를 무한정 점유합니다.
SOLVER_TIME_LIMIT_SECONDS = 60.0

# 배정 작업(job) 1개 전체의 상한(초)입니다. 배정이 불가능하면 멤버 1명씩 제외한 계산을 멤버 수만큼
# 반복하므로 실행 시간이 멤버 수에 비례합니다. 이 상한을 넘기면 조율안을 버리고 실패로 끝내,
# 해결되지 않는 입력 1개가 worker 를 무기한 점유하지 않게 합니다.
RESOLUTION_TIME_LIMIT_SECONDS = 300.0


def resolve(
    teams: list[Team],
    rooms: list[Room],
    sessions_per_team: int,
    slot_minutes: int,
    session_minutes: int,
) -> Resolution:
    """teams 를 rooms 에 배정하고, 배정이 불가능하면 조율안을 함께 반환합니다."""
    # 상한 2개를 이 자리에서 전달합니다. 기능 파일이 상한을 직접 들고 있으면 계산 1회의 상한과
    # 작업 전체의 상한이 서로 다른 파일에 흩어져, 둘의 비율을 한 자리에서 판단할 수 없습니다.
    return resolve_sessions(
        teams,
        rooms,
        sessions_per_team,
        slot_minutes,
        session_minutes,
        solver_time_limit_seconds=SOLVER_TIME_LIMIT_SECONDS,
        resolution_time_limit_seconds=RESOLUTION_TIME_LIMIT_SECONDS,
    )


__all__ = [
    "Assignment",
    "Room",
    "RoomInterval",
    "Member",
    "Team",
    "TimeInterval",
    "Resolution",
    "resolve",
    "generate_slots",
    "generate_sessions",
    "SOLVER_TIME_LIMIT_SECONDS",
    "RESOLUTION_TIME_LIMIT_SECONDS",
]
