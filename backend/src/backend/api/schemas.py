from datetime import datetime

from pydantic import BaseModel, Field


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


class AssignmentOut(BaseModel):
    feasible: bool
    slots_by_team: dict[str, list[RoomSlotOut]]
    open_slots: list[RoomSlotOut]


class ProposalOut(BaseModel):
    excluded_member: str
    assignment: AssignmentOut


class ResolutionOut(BaseModel):
    assignment: AssignmentOut
    proposals: list[ProposalOut]


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


class PeriodRoomSlotOut(BaseModel):
    room_id: int
    room: str
    start: datetime
    end: datetime


class PeriodAssignmentOut(BaseModel):
    feasible: bool
    slots_by_team: dict[str, list[PeriodRoomSlotOut]]
    open_slots: list[PeriodRoomSlotOut]


class ExcludedMemberOut(BaseModel):
    id: int
    name: str


class PeriodProposalOut(BaseModel):
    excluded_member: ExcludedMemberOut
    assignment: PeriodAssignmentOut


class PeriodAssignOut(BaseModel):
    saved: bool
    assignment: PeriodAssignmentOut
    proposals: list[PeriodProposalOut]


class RollbackOut(BaseModel):
    rolled_back: bool
