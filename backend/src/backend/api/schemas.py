from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from backend.db.models import Instrument, Permission
from backend.db.models import NotificationKind

class RoomSlotOut(BaseModel):
    # 배정의 1시간 slot(1시간 단위 시간 칸)입니다. 합주실은 DB의 번호와 이름을 함께 반환합니다.
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
    # open_slots는 어느 팀도 사용하지 않는 1시간 slot(1시간 단위 시간 칸)입니다. 화면은
    # open_slots의 시간만 예약용으로 개방합니다.
    rows: list[ScheduleRowOut]
    open_slots: list[RoomSlotOut]


class PeriodAssignIn(BaseModel):
    team_ids: list[int] = Field(min_length=1, max_length=20)
    room_ids: list[int] = Field(min_length=1, max_length=10)


class BackupOut(BaseModel):
    # 회차를 구분하는 값은 저장 시각입니다. assignment_backups에 별도 회차 번호가 없습니다.
    saved_at: datetime
    slot_count: int


class BackupsOut(BaseModel):
    backups: list[BackupOut]


class BackupRoundOut(BaseModel):
    # 지난 회차의 시간표입니다. 확정 시간표(ScheduleOut)와 row(데이터베이스 행) 구조는 같지만
    # open_slots는 없습니다. 지나간 회차에 예약을 개방할 필요가 없습니다.
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
    # PATCH는 요청에 포함된 항목만 수정합니다. 포함되지 않은 항목은 None으로 남아
    # 서비스가 처리하지 않습니다.
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
    # 포지션 전체 수와 그중 사람이 들어간 수. 둘을 함께 주어야 화면이 몇 포지션이 비었는지 압니다.
    slot_count: int
    filled_count: int


class TeamsOut(BaseModel):
    teams: list[TeamOut]


class TeamEnvelopeOut(BaseModel):
    team: TeamOut


class TeamSlotsIn(BaseModel):
    """포지션 구성만 수신합니다. 팀 이름은 팀을 수정하는 endpoint(API의 요청 주소 단위)가
    따로 처리합니다.
    """

    slots: dict[str, int]


class TeamCreateIn(BaseModel):
    # 생성자는 요청 본문이 아니라 인증 cookie(HTTP 요청 헤더에 포함되는 사용자 정보)의 소유자입니다.
    name: str
    # 포지션마다 몇 자리인지입니다. 0인 포지션은 요청에 포함해도 되고 제외해도 됩니다.
    # 포지션을 만들지 않습니다.
    slots: dict[str, int]


class TeamUpdateIn(BaseModel):
    name: str


class SlotOut(BaseModel):
    id: int
    team_id: int
    instrument: Instrument
    # 같은 포지션이 1명 이상일 때 몇 번째인지입니다. 화면은 "일렉 2" 처럼 포지션에 숫자를 부여해 표시합니다.
    ordinal: int
    # 아직 아무도 배정되지 않은 포지션은 세 필드가 모두 null입니다.
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
    # 사용자를 구분하는 값입니다. 이름, 학과, 학번, 기수 네 가지입니다. 이 조건이
    # 생기기 전에 등록된 사용자는 학과와 학번이 null입니다.
    department: str | None = None
    student_no: str | None = None
    cohort: int | None = None


class MemberRowOut(MemberOut):
    """멤버 화면의 한 줄입니다. 가진 permission set(권한 집합) 이름이 함께 포함됩니다."""

    permission_sets: list[str]


class MemberRowsOut(BaseModel):
    members: list[MemberRowOut]


class MembersOut(BaseModel):
    members: list[MemberOut]


class MemberSearchOut(BaseModel):
    """포지션에 배정할 사용자를 찾는 검색 기능의 결과입니다."""

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
    # 업로드한 사용자가 지정한 이름입니다. 저장 이름은 서버가 따로 생성하고
    # 외부에 노출하지 않습니다.
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
    # author_id는 여기 없습니다. 글쓴이는 인증 token(세션 정보)으로 확인한 요청자입니다.
    # 클라이언트가 보내도 스키마에 없는 항목이므로 무시됩니다.
    title: str = Field(max_length=200)
    body: str = Field(max_length=20000)


class CommentCreateIn(BaseModel):
    body: str = Field(max_length=2000)


class AccountOut(BaseModel):
    id: int
    name: str
    email: str
    # role은 permissions에서 추출한 값입니다. 18가지 권한이 모두 설정되어 있으면
    # head_manager입니다. 화면이 아직 이 값으로 레이블(화면에 표시되는 텍스트)을
    # 선택하고 있어 함께 제공합니다.
    role: Literal["head_manager", "member"]
    permissions: list[Permission]
    # 기수입니다. 화면이 동명이인을 구분할 때 이름 옆에 표시합니다.
    cohort: int | None = None


class PermissionSetIn(BaseModel):
    name: str = Field(max_length=50)
    # 무엇을 하는 사람에게 주는 권한인지입니다. 반드시 기록합니다(사용자 결정).
    description: str = Field(max_length=200)
    permissions: list[Permission] = Field(max_length=20)


class PermissionSetMemberOut(BaseModel):
    """permission set(권한 집합)을 가진 사용자 하나입니다. ID로 사용자를 식별하고,
    이름은 표시하기 위한 것입니다.
    """

    id: int
    name: str


class PermissionSetOut(BaseModel):
    id: int
    name: str
    description: str
    permissions: list[Permission]
    # ID만 제공하면 화면이 이름을 다른 목록에서 찾아야 합니다. 그 목록은 page(화면 분할
    # 단위) 단위라 모두 있지 않을 수 있습니다. 이름까지 여기에 포함해 보냅니다.
    members: list[PermissionSetMemberOut]


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
    # 내가 들어가 있는 포지션을 팀 번호 순으로 담습니다. 화면이 내 팀을 가려내는 근거입니다.
    teams: list[MyTeamOut]


class SignupIn(BaseModel):
    name: str = Field(max_length=100)
    department: str = Field(max_length=50)
    student_no: str = Field(max_length=20)
    email: str = Field(max_length=254)
    password: str = Field(max_length=100)
    # 기수. 1981년이 1기지만 연도로 환산하지 않고 숫자를 그대로 받습니다.
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
    # 로그인 상태 유지. 끄면 브라우저를 닫을 때 풀립니다.
    keep: bool = False


class UnavailableOut(BaseModel):
    id: int
    member_id: int
    starts_at: datetime
    ends_at: datetime
    repeats_daily: bool
    repeats_weekly: bool
    repeat_until: date | None
    reason: str | None


class UnavailableTimesOut(BaseModel):
    times: list[UnavailableOut]


class UnavailableEnvelopeOut(BaseModel):
    time: UnavailableOut


class UnavailableCreateIn(BaseModel):
    starts_at: datetime
    ends_at: datetime
    repeats_daily: bool = False
    repeats_weekly: bool = False
    repeat_until: date | None = None
    # 사유는 사람이 적는 한 줄입니다. 안 적어도 등록됩니다.
    reason: str | None = Field(default=None, max_length=200)


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
    # 예약하는 사람은 요청 본문이 아니라 인증 쿠키의 주인입니다.
    room_id: int
    team_id: int | None = None
    starts_at: datetime
    ends_at: datetime


class ReservationUpdateIn(BaseModel):
    # 옮길 시각만 받습니다. 방·팀·주인은 원래 예약의 값을 그대로 씁니다.
    starts_at: datetime
    ends_at: datetime


class NotificationOut(BaseModel):
    id: int
    # 무슨 일이 있었는지만 담습니다. 사람이 읽을 문장은 화면이 이 값으로 만듭니다.
    kind: NotificationKind
    created_at: str
    read: bool


class NotificationsOut(BaseModel):
    notifications: list[NotificationOut]


class FindIdIn(BaseModel):
    # 길이 상한은 SignupIn·LoginIn 과 같은 값입니다. 로그인 없이 열려 있는 endpoint 라
    # 아무 길이나 받으면 큰 글자를 계속 보내는 것만으로 서버를 붙잡아 둘 수 있습니다.
    name: str = Field(max_length=100)
    email: str = Field(max_length=254)


class PasswordResetIn(BaseModel):
    email: str = Field(max_length=254)


class PasswordResetConfirmIn(BaseModel):
    # 토큰은 secrets.token_urlsafe(32) 가 낸 43글자입니다. 넉넉히 잡아도 100 이면 충분하입니다.
    token: str = Field(max_length=100)
    password: str = Field(max_length=100)


class AckOut(BaseModel):
    # 아이디 찾기와 비밀번호 재설정 요청이 함께 씁니다. 계정이 있든 없든 이 한 가지
    # 답만 나가야 그 이메일이 가입돼 있는지가 응답으로 새지 않습니다.
    ok: bool = True
