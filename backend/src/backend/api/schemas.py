from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from backend.db.models import Instrument, Permission
from backend.db.models import NotificationKind

class RoomSlotOut(BaseModel):
    # 배정 한 칸. 방은 DB 의 번호와 이름을 함께 돌려준다.
    room_id: int
    room: str
    start: datetime
    end: datetime


class ExcludedMemberOut(BaseModel):
    id: int
    name: str


class AssignmentOut(BaseModel):
    feasible: bool
    slots_by_team: dict[str, list[RoomSlotOut]]
    open_slots: list[RoomSlotOut]


class ProposalOut(BaseModel):
    excluded_member: ExcludedMemberOut
    assignment: AssignmentOut


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
    open_slots: list[RoomSlotOut]


class PeriodAssignIn(BaseModel):
    team_ids: list[int] = Field(min_length=1, max_length=20)
    room_ids: list[int] = Field(min_length=1, max_length=10)


class BackupOut(BaseModel):
    # 회차를 가르는 값은 저장 시각이다 — assignment_backups 에 별도 회차 번호가 없다.
    saved_at: datetime
    slot_count: int


class BackupsOut(BaseModel):
    backups: list[BackupOut]


class BackupRoundOut(BaseModel):
    # 지난 회차의 시간표. 확정 시간표(ScheduleOut)와 줄 서식은 같지만 open_slots 가
    # 없다 — 지나간 회차에 예약을 열 자리는 없다.
    rows: list[ScheduleRowOut]


class PeriodAssignOut(BaseModel):
    assignment: AssignmentOut
    proposals: list[ProposalOut]
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
    # 포지션 전체 수와 그중 사람이 들어간 수. 둘을 함께 주어야 화면이 몇 포지션이 비었는지 안다.
    slot_count: int
    filled_count: int


class TeamsOut(BaseModel):
    teams: list[TeamOut]


class TeamEnvelopeOut(BaseModel):
    team: TeamOut


class TeamSlotsIn(BaseModel):
    """포지션 구성만 받는다. 팀 이름은 팀을 고치는 endpoint 가 따로 맡는다."""

    slots: dict[str, int]


class TeamCreateIn(BaseModel):
    # 만든 사람은 요청 본문이 아니라 인증 쿠키의 주인이다.
    name: str
    # 악기마다 몇 포지션인지. 0인 악기는 보내도 되고 빼도 된다 — 포지션을 만들지 않는다.
    slots: dict[str, int]


class TeamUpdateIn(BaseModel):
    name: str


class SlotOut(BaseModel):
    id: int
    team_id: int
    instrument: Instrument
    # 같은 악기가 여럿일 때 몇 번째인지. 화면은 "일렉 2" 처럼 붙여 보여준다.
    ordinal: int
    # 아직 아무도 안 들어간 포지션은 셋 다 비어 있다.
    member_id: int | None = None
    member_name: str | None = None
    member_cohort: int | None = None


class SlotsOut(BaseModel):
    slots: list[SlotOut]


class SlotEnvelopeOut(BaseModel):
    slot: SlotOut


class SlotAssignIn(BaseModel):
    member_id: int


class MemberOut(BaseModel):
    id: int
    name: str
    # 사람이 사람을 가르는 값 — 이름·학과·학번·기수 네 가지다. 이 조건이 생기기
    # 전에 들어온 사람은 학과·학번이 비어 있다.
    department: str | None = None
    student_no: str | None = None
    cohort: int | None = None


class MemberRowOut(MemberOut):
    """멤버 화면의 한 줄. 가진 권한 묶음 이름이 함께 온다."""

    permission_sets: list[str]


class MemberRowsOut(BaseModel):
    members: list[MemberRowOut]


class MembersOut(BaseModel):
    members: list[MemberOut]


class MemberSearchOut(BaseModel):
    """포지션에 넣을 사람을 고르는 돋보기의 결과."""

    members: list[MemberOut]


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
    # role 은 permissions 에서 뽑아낸 값이다 — 열여덟 가지가 전부 켜져 있으면
    # head_manager. 화면이 아직 이 값으로 글자를 고르고 있어 함께 내려준다.
    role: Literal["head_manager", "member"]
    permissions: list[Permission]
    # 기수. 화면이 동명이인을 가를 때 이름 옆에 붙인다.
    cohort: int | None = None


class PermissionSetIn(BaseModel):
    name: str = Field(max_length=50)
    # 무엇을 하는 사람에게 주는 권한인지. 반드시 적는다(사용자 결정).
    description: str = Field(max_length=200)
    permissions: list[Permission] = Field(max_length=20)


class PermissionSetOut(BaseModel):
    id: int
    name: str
    description: str
    permissions: list[Permission]
    member_ids: list[int]


class PermissionSetsOut(BaseModel):
    permission_sets: list[PermissionSetOut]


class PermissionSetEnvelopeOut(BaseModel):
    permission_set: PermissionSetOut


class AuthOut(BaseModel):
    account: AccountOut


class MyTeamOut(BaseModel):
    team_id: int
    team_name: str
    instrument: Instrument
    ordinal: int


class MeOut(BaseModel):
    account: AccountOut
    # 내가 들어가 있는 포지션을 팀 번호 순으로 담는다. 화면이 내 팀을 가려내는 근거다.
    teams: list[MyTeamOut]


class SignupIn(BaseModel):
    name: str = Field(max_length=100)
    department: str = Field(max_length=50)
    student_no: str = Field(max_length=20)
    email: str = Field(max_length=254)
    password: str = Field(max_length=100)
    # 기수. 1981년이 1기지만 연도로 환산하지 않고 숫자를 그대로 받는다.
    cohort: int


class ProfileEditIn(BaseModel):
    name: str = Field(max_length=50)
    cohort: int | None = None


class PasswordChangeIn(BaseModel):
    current: str = Field(max_length=100)
    next: str = Field(max_length=100)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=100)
    # 로그인 상태 유지. 끄면 브라우저를 닫을 때 풀린다.
    keep: bool = False


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
