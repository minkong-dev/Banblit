from datetime import datetime

from pydantic import BaseModel


class IntervalIn(BaseModel):
    start: datetime
    end: datetime


class MemberIn(BaseModel):
    name: str
    unavailable: list[IntervalIn] = []


class TeamIn(BaseModel):
    name: str
    members: list[MemberIn]


class RoomIn(BaseModel):
    name: str
    open_period: IntervalIn


class AssignRequest(BaseModel):
    teams: list[TeamIn]
    rooms: list[RoomIn]
    slots_per_team: int
