from datetime import date, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

from backend.db.models import JoinPolicy, MembershipStatus, Permission
from backend.db.models import NotificationKind

# 배정 결과의 모양은 한 벌만 둔다. slot 과 제외 인원의 타입만 갈아 끼운다 —
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


class PeriodRoomSlotOut(RoomSlotOut):
    # 기간 배정은 DB 에 있는 방을 쓰므로 이름과 함께 실제 번호를 돌려준다.
    room_id: int


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
    # open_slots 는 아무 팀도 쓰지 않는 30분 slot 이다. 화면은 open_slots 의 시간만 예약으로 연다.
    rows: list[ScheduleRowOut]
    open_slots: list[PeriodRoomSlotOut]


class PeriodAssignIn(BaseModel):
    team_ids: list[int] = Field(min_length=1, max_length=20)
    room_ids: list[int] = Field(min_length=1, max_length=10)


class BackupOut(BaseModel):
    # 회차를 가르는 값은 저장 시각이다 — assignment_backups 에 별도 회차 번호가 없다.
    saved_at: datetime
    slot_count: int


class BackupsOut(BaseModel):
    backups: list[BackupOut]


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
    # 이 팀에 참가하면 바로 소속이 되는지("auto"), 승인을 기다리는지("approval").
    join_policy: JoinPolicy


class TeamsOut(BaseModel):
    teams: list[TeamOut]


class TeamEnvelopeOut(BaseModel):
    team: TeamOut


class TeamCreateIn(BaseModel):
    # 만든 사람은 요청 본문이 아니라 인증 쿠키의 주인이다.
    name: str


class TeamUpdateIn(BaseModel):
    name: str
    # 안 보내면 참가 승인 방식은 그대로 둔다.
    join_policy: JoinPolicy | None = None


class MembershipOut(BaseModel):
    member_id: int
    member_name: str
    team_id: int
    position: str
    # "approved" 면 가입됨, "pending" 이면 신청만 걸린 것이다.
    status: MembershipStatus


class JoinRequestOut(BaseModel):
    member_id: int
    member_name: str
    position: str


class JoinRequestsOut(BaseModel):
    join_requests: list[JoinRequestOut]


class MembershipEnvelopeOut(BaseModel):
    membership: MembershipOut


class MembershipCreateIn(BaseModel):
    # 참가하는 사람은 인증 쿠키의 주인이다. 남을 대신 넣는 항목은 만들지 않았다.
    # ponytail: 헤드매니저가 남을 팀에 넣는 화면이 생기면 member_id 를 여기 되살린다.
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


class AttachmentOut(BaseModel):
    id: int
    post_id: int
    # 올린 사람이 보낸 이름이다. 저장 이름은 서버가 따로 만들고 밖으로 내보내지 않는다.
    name: str
    size: int
    content_type: str
    uploaded_at: str


class AttachmentsOut(BaseModel):
    attachments: list[AttachmentOut]


class AttachmentEnvelopeOut(BaseModel):
    attachment: AttachmentOut


class PostDetailOut(BaseModel):
    post: PostOut
    comments: list[CommentOut]
    attachments: list[AttachmentOut]


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
    # role 은 permissions 에서 뽑아낸 값이다 — 열한 가지가 전부 켜져 있으면
    # head_manager. 화면이 아직 이 값으로 글자를 고르고 있어 함께 내려준다.
    role: Literal["head_manager", "member"]
    permissions: list[Permission]
    positions: list[str]


class PermissionSetIn(BaseModel):
    name: str = Field(max_length=50)
    permissions: list[Permission] = Field(max_length=20)


class PermissionSetOut(BaseModel):
    id: int
    name: str
    permissions: list[Permission]
    member_ids: list[int]


class PermissionSetsOut(BaseModel):
    permission_sets: list[PermissionSetOut]


class PermissionSetEnvelopeOut(BaseModel):
    permission_set: PermissionSetOut


class AuthOut(BaseModel):
    account: AccountOut


class MyMembershipOut(BaseModel):
    team_id: int
    team_name: str
    position: str
    # "approved" 면 그 팀 소속이고, "pending" 이면 승인을 기다리는 중이다.
    status: MembershipStatus


class MeOut(BaseModel):
    account: AccountOut
    # 승인된 소속과 대기 중인 신청을 팀 번호 순으로 함께 담는다 — 화면이 새로 고쳐도
    # 자기가 어디에 신청해 뒀는지 알 수 있는 곳이 여기뿐이다.
    memberships: list[MyMembershipOut]


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
    # 예약하는 사람은 요청 본문이 아니라 인증 쿠키의 주인이다.
    room_id: int
    team_id: int | None = None
    starts_at: datetime
    ends_at: datetime


class ReservationUpdateIn(BaseModel):
    # 옮길 시각만 받는다. 방·팀·주인은 원래 예약의 값을 그대로 쓴다.
    starts_at: datetime
    ends_at: datetime


class NotificationOut(BaseModel):
    id: int
    # 무슨 일이 있었는지만 담는다. 사람이 읽을 문장은 화면이 이 값으로 만든다.
    kind: NotificationKind
    created_at: str
    read: bool


class NotificationsOut(BaseModel):
    notifications: list[NotificationOut]


class FindIdIn(BaseModel):
    # 길이 상한은 SignupIn·LoginIn 과 같은 값이다. 로그인 없이 열려 있는 endpoint 라
    # 아무 길이나 받으면 큰 글자를 계속 보내는 것만으로 서버를 붙잡아 둘 수 있다.
    name: str = Field(max_length=100)
    email: str = Field(max_length=254)


class PasswordResetIn(BaseModel):
    email: str = Field(max_length=254)


class PasswordResetConfirmIn(BaseModel):
    # 토큰은 secrets.token_urlsafe(32) 가 낸 43글자다. 넉넉히 잡아도 100 이면 충분하다.
    token: str = Field(max_length=100)
    password: str = Field(max_length=100)


class AckOut(BaseModel):
    # 아이디 찾기와 비밀번호 재설정 요청이 함께 쓴다. 계정이 있든 없든 이 한 가지
    # 답만 나가야 그 이메일이 가입돼 있는지가 응답으로 새지 않는다.
    ok: bool = True
