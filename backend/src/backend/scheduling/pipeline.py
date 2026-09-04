# scheduling 모듈의 시퀀스 파일 — api 는 scheduling 안의 다른 파일을 직접 부르지
# 않고 이 파일만 참조한다. 슬롯 생성 → 배정 → 조율안이라는 계산 순서는 이미
# resolution.resolve 안에 있으므로, 여기서는 그 결과와 입력 자료형을 그대로
# 내보내는 것만 한다.
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
