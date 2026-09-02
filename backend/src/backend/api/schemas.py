from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

# 배정 결과의 모양은 한 벌만 둔다. 칸과 제외 인원의 타입만 갈아 끼운다 —
# /assign 은 이름만 주고받고, 기간 배정은 거기에 실제 id 가 붙는다.
SlotT = TypeVar("SlotT", bound=BaseModel)
ExcludedT = TypeVar("ExcludedT")


class IntervalIn(BaseModel):
    start: datetime
    end: datetime


class MemberIn(BaseModel):
    name: str
    unavailable: list[IntervalIn] = Field(default_factory=list, max_length=100)


class TeamIn(BaseModel):
    name: str
    members: list[MemberIn] = Field(min_length=1, max_length=10)


class RoomIn(BaseModel):
    name: str
    open_period: IntervalIn


class AssignRequest(BaseModel):
    teams: list[TeamIn] = Field(min_length=1, max_length=20)
    rooms: list[RoomIn] = Field(min_length=1, max_length=10)
    slots_per_team: int


class RoomSlotOut(BaseModel):
    room: str
    start: datetime
    end: datetime


class AssignmentOut(BaseModel, Generic[SlotT]):
    feasible: bool
    slots_by_team: dict[str, list[SlotT]]
    open_slots: list[SlotT]


class ProposalOut(BaseModel, Generic[SlotT, ExcludedT]):
    excluded_member: ExcludedT
    assignment: AssignmentOut[SlotT]


class ResolutionOut(BaseModel, Generic[SlotT, ExcludedT]):
    assignment: AssignmentOut[SlotT]
    proposals: list[ProposalOut[SlotT, ExcludedT]]


class ScheduleRowOut(BaseModel):
    team_id: int
    team: str
    room_id: int
    room: str
    start: datetime
    end: datetime


class ScheduleOut(BaseModel):
    rows: list[ScheduleRowOut]


class PeriodAssignIn(BaseModel):
    team_ids: list[int] = Field(min_length=1, max_length=20)
    room_ids: list[int] = Field(min_length=1, max_length=10)


class PeriodRoomSlotOut(RoomSlotOut):
    # 기간 배정은 DB 에 있는 방을 쓰므로 이름과 함께 실제 번호를 돌려준다.
    room_id: int


class ExcludedMemberOut(BaseModel):
    id: int
    name: str


PeriodAssignmentOut = AssignmentOut[PeriodRoomSlotOut]
PeriodProposalOut = ProposalOut[PeriodRoomSlotOut, ExcludedMemberOut]


class PeriodAssignOut(ResolutionOut[PeriodRoomSlotOut, ExcludedMemberOut]):
    saved: bool


class RollbackOut(BaseModel):
    rolled_back: bool
