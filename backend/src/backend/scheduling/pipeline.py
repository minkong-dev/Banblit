# scheduling 모듈의 공개 interface(다른 모듈에서 접근하는 진입점) 파일입니다.
# api는 scheduling 내의 다른 파일을 직접 호출하지 않고 이 파일만 참조합니다.
# slot(점유 단위 길이의 시간 칸) 생성, 배정, 조율안 생성이라는 계산 순서는 이미
# resolution.resolve 안에 있으므로, 이 파일은 그 결과와 입력 자료형을 그대로
# 공개하기만 합니다.
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
