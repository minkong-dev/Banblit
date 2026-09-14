# scheduling 모듈의 공개 interface(다른 모듈에서 접근하는 진입점) 파일입니다.
# api는 scheduling 내의 다른 파일을 직접 호출하지 않고 이 파일만 참조합니다.
# slot(1시간 단위 시간 칸) 생성 → 배정 → 조율안이라는 계산 순서는 이미
# resolution.resolve 안에 있으므로, 여기서는 그 결과와 입력 자료형을 그대로
# 공개하는 것만 합니다.
from backend.scheduling.assignment import Assignment, Room, RoomSlot
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import Resolution, resolve
from backend.scheduling.slots import generate_slots

__all__ = [
    "Assignment",
    "Room",
    "RoomSlot",
    "Member",
    "Team",
    "TimeInterval",
    "Resolution",
    "resolve",
    "generate_slots",
]
