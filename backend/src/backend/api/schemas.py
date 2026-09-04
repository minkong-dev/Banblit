from datetime import date, datetime
from typing import Generic, Literal, TypeVar

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


class JobOut(BaseModel):
    id: str
    period_id: int
    status: Literal["queued", "running", "done", "failed"]
    requested_at: datetime
    finished_at: datetime | None = None
    result: PeriodAssignOut | None = None
    error: str | None = None


class JobEnvelopeOut(BaseModel):
    job: JobOut


class RoomOut(BaseModel):
    id: int
    name: str
    opens_at: str
    closes_at: str


class RoomsOut(BaseModel):
    rooms: list[RoomOut]


class RoomEnvelopeOut(BaseModel):
    room: RoomOut


class RoomCreateIn(BaseModel):
    name: str
    opens_at: str
    closes_at: str


class RoomUpdateIn(BaseModel):
    # PATCH는 보낸 항목만 고친다 — 안 보낸 항목은 None으로 남아 서비스가 건드리지 않는다.
    name: str | None = None
    opens_at: str | None = None
    closes_at: str | None = None


class PeriodOut(BaseModel):
    id: int
    kind: str
    starts_on: str
    ends_on: str
    everyday: bool
    first_run_at: str
    second_run_at: str


class PeriodsOut(BaseModel):
    periods: list[PeriodOut]


class PeriodEnvelopeOut(BaseModel):
    period: PeriodOut


class PeriodCreateIn(BaseModel):
    kind: str
    starts_on: str
    ends_on: str
    everyday: bool
    first_run_at: str
    second_run_at: str


class PeriodUpdateIn(BaseModel):
    kind: str | None = None
    starts_on: str | None = None
    ends_on: str | None = None
    everyday: bool | None = None
    first_run_at: str | None = None
    second_run_at: str | None = None


class TeamOut(BaseModel):
    id: int
    name: str
    member_count: int


class TeamsOut(BaseModel):
    teams: list[TeamOut]


class TeamEnvelopeOut(BaseModel):
    team: TeamOut


class TeamCreateIn(BaseModel):
    name: str
    requested_by: int


class TeamUpdateIn(BaseModel):
    name: str
    requested_by: int


class MembershipOut(BaseModel):
    member_id: int
    member_name: str
    team_id: int
    position: str


class MembershipEnvelopeOut(BaseModel):
    membership: MembershipOut


class MembershipCreateIn(BaseModel):
    member_id: int
    position_id: int


class MemberOut(BaseModel):
    id: int
    name: str
    positions: list[str]


class MembersOut(BaseModel):
    members: list[MemberOut]


class PositionOut(BaseModel):
    id: int
    name: str


class PositionsOut(BaseModel):
    positions: list[PositionOut]


class PostOut(BaseModel):
    id: int
    team_id: int | None
    title: str
    body: str
    author_id: int
    author: str
    created_at: str
    comment_count: int


class PostsOut(BaseModel):
    posts: list[PostOut]


class PostEnvelopeOut(BaseModel):
    post: PostOut


class CommentOut(BaseModel):
    id: int
    post_id: int
    body: str
    author_id: int
    author: str
    created_at: str


class PostDetailOut(BaseModel):
    post: PostOut
    comments: list[CommentOut]


class CommentEnvelopeOut(BaseModel):
    comment: CommentOut


class PostCreateIn(BaseModel):
    # author_id 는 여기 없다 — 글쓴이는 토큰으로 확인한 요청자다. 클라이언트가
    # 보내도 스키마에 없는 항목이라 조용히 무시된다.
    title: str = Field(max_length=200)
    body: str = Field(max_length=20000)


class CommentCreateIn(BaseModel):
    body: str = Field(max_length=2000)


class AccountOut(BaseModel):
    id: int
    name: str
    email: str
    role: Literal["head_manager", "member"]
    positions: list[str]


class AuthOut(BaseModel):
    account: AccountOut


class MeOut(BaseModel):
    account: AccountOut


class SignupIn(BaseModel):
    name: str = Field(max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(max_length=100)
    positions: list[str] = Field(min_length=1, max_length=10)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=100)


class UnavailableOut(BaseModel):
    id: int
    member_id: int
    starts_at: datetime
    ends_at: datetime
    repeats_weekly: bool
    repeat_until: date | None


class UnavailableTimesOut(BaseModel):
    times: list[UnavailableOut]


class UnavailableEnvelopeOut(BaseModel):
    time: UnavailableOut


class UnavailableCreateIn(BaseModel):
    # 로그인이 붙으면 member_id는 경로가 아니라 토큰의 주인으로 확인한다. 지금은
    # 요청자를 몰라 URL 의 member_id 를 그대로 믿는다.
    starts_at: datetime
    ends_at: datetime
    repeats_weekly: bool = False
    repeat_until: date | None = None


class ReservationOut(BaseModel):
    id: int
    room_id: int
    room: str
    team_id: int | None
    team: str | None
    member_id: int
    member: str
    start: datetime
    end: datetime


class ReservationsOut(BaseModel):
    reservations: list[ReservationOut]


class ReservationCreateIn(BaseModel):
    # author_id 처럼 사람 번호를 본문으로 받는다 — 로그인이 붙으면 여기서 토큰의
    # 주인과 member_id 가 맞는지 확인한다. 지금은 요청한 사람이 누구인지 서버가
    # 모르므로 이 규칙을 걸 수 없다.
    room_id: int
    member_id: int
    team_id: int | None = None
    starts_at: datetime
    ends_at: datetime
