from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, NaiveDatetime

from backend.db.models import Instrument, Permission
from backend.db.models import NotificationKind

class RoomSlotOut(BaseModel):
    # 배정의 slot(점유 단위 길이의 시간 칸)입니다. 합주실은 DB의 번호와 이름을 함께 반환합니다.
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
    # open_slots 는 어느 팀도 배정받지 않은 slot(점유 단위 길이의 시간 칸)입니다. 예약 대상이 아닙니다 —
    # 이 slot 은 집중 합주기간 안에 있고, 그 기간의 예약은 services/reservation_service.py 가 전부
    # 거절합니다. 어느 자리가 비었는지를 알리는 값이며 지금은 화면이 사용하지 않습니다.
    rows: list[ScheduleRowOut]
    open_slots: list[RoomSlotOut]


class PeriodAssignIn(BaseModel):
    team_ids: list[int] = Field(min_length=1, max_length=20)
    room_ids: list[int] = Field(min_length=1, max_length=10)


class BackupOut(BaseModel):
    # 배정기록을 구분하는 값은 저장 시각입니다. assignment_backups에 별도 배정기록 번호가 없습니다.
    saved_at: datetime
    slot_count: int


class BackupsOut(BaseModel):
    backups: list[BackupOut]


class BackupRoundOut(BaseModel):
    # 지난 배정기록의 시간표입니다. 확정 시간표(ScheduleOut)와 row(데이터베이스 행) 구조는 같지만
    # open_slots는 없습니다. 지나간 배정기록에 예약을 개방할 필요가 없습니다.
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


class EnsembleDayOut(BaseModel):
    day: str
    starts_at: str
    ends_at: str


class EnsembleOut(BaseModel):
    starts_on: str
    ends_on: str
    room_id: int
    # 기본 시각입니다. days 에 있는 날짜는 그 행의 시각을 따릅니다.
    starts_at: str
    ends_at: str
    days: list[EnsembleDayOut]


class PeriodOut(BaseModel):
    id: int
    kind: str
    starts_on: str
    ends_on: str
    everyday: bool
    first_run_at: str
    second_run_at: str
    # 전체합주를 지정하지 않은 기간은 null 입니다.
    ensemble: EnsembleOut | None


class EnsembleIn(BaseModel):
    starts_on: str
    ends_on: str
    room_id: int
    starts_at: str
    ends_at: str


class EnsembleDayIn(BaseModel):
    starts_at: str
    ends_at: str


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
    # 팀 색 이름입니다(backend/db/models.py 의 TEAM_COLORS 중 하나). 화면이 달력·목록의 색으로 씁니다.
    color: str
    # 포지션 전체 수와 그중 멤버가 배정된 수입니다. 둘을 함께 반환해야 화면이 비어 있는 포지션 수를 계산할 수 있습니다.
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
    # 팀을 생성하는 사람은 요청 본문이 아니라 인증 cookie(브라우저가 저장해 요청마다 함께 보내는 값)로 확인한 요청자입니다.
    name: str
    # 포지션마다 자리 수입니다. 0 인 포지션은 요청에 포함해도 되고 제외해도 되며, 포지션을 생성하지 않습니다.
    slots: dict[str, int]
    # 팀 색입니다. 선택하지 않으면(None) DB 가 다른 팀이 사용하지 않는 색 중 1번째 색을 저장합니다.
    color: str | None = None


class TeamUpdateIn(BaseModel):
    name: str
    # 팀 색입니다. None 이면 색을 그대로 둡니다.
    color: str | None = None


class SlotOut(BaseModel):
    id: int
    team_id: int
    instrument: Instrument
    # 같은 포지션이 1명 이상일 때 몇 번째인지입니다. 화면은 "일렉 2" 처럼 포지션에 숫자를 부여해 표시합니다.
    ordinal: int
    # 아직 멤버가 배정되지 않은 포지션은 member_id·member_name·member_cohort 가 모두 null 입니다.
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
    # 사용자를 구분하는 값은 이름, 학과, 학번, 기수 4가지입니다. 이 제약이
    # 추가되기 전에 등록된 사용자는 학과와 학번이 null 입니다.
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
    # 가린 사람의 이름입니다. 가려지지 않은 글은 언제나 None 이라, 값이 차는 곳은 격리 목록뿐입니다.
    blinded_by: str | None = None


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
    # author_id 는 이 schema 에 없습니다. 작성자는 인증 cookie 로 확인한 요청자입니다.
    # 클라이언트가 보내도 schema 에 없는 항목이므로 무시됩니다.
    title: str = Field(max_length=200)
    body: str = Field(max_length=20000)


class CommentCreateIn(BaseModel):
    body: str = Field(max_length=2000)


class AccountOut(BaseModel):
    id: int
    name: str
    email: str
    # role 은 permissions 에서 계산한 값입니다. PERMISSIONS 의 항목 전부가 설정되어 있으면
    # head_manager 입니다. 화면이 아직 이 값으로 label(화면에 표시되는 텍스트)을
    # 선택하고 있어 함께 제공합니다.
    role: Literal["head_manager", "member"]
    permissions: list[Permission]
    # 가진 permission set 의 이름입니다. 화면은 "헤드매니저" 고정 문구 대신 이 이름을 역할로 표시합니다.
    permission_sets: list[str]
    # 기수입니다. 화면이 동명이인을 구분할 때 이름 옆에 표시합니다.
    cohort: int | None = None


class PermissionSetIn(BaseModel):
    name: str = Field(max_length=50)
    # 이 permission set 을 어떤 역할의 사람에게 부여하는지 설명하는 문장입니다. 빈 값을 허용하지 않습니다.
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
    # id 만 제공하면 화면이 이름을 멤버 목록에서 찾아야 합니다. 멤버 목록은 page(한 번에 받는
    # 행 묶음) 단위로 받으므로 아직 받지 않은 멤버가 있을 수 있습니다. 그래서 이름까지 포함합니다.
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
    # 요청자가 배정된 포지션을 팀 번호 순으로 포함합니다. 화면이 "내 팀"을 구분하는 근거입니다.
    teams: list[MyTeamOut]


class SignupIn(BaseModel):
    name: str = Field(max_length=100)
    department: str = Field(max_length=50)
    student_no: str = Field(max_length=20)
    email: str = Field(max_length=254)
    password: str = Field(max_length=100)
    # 기수입니다. 1981년이 1기지만 연도로 환산하지 않고 숫자를 그대로 받습니다.
    cohort: int
    # 관리자코드입니다. 환경변수 ADMIN_SIGNUP_CODE 와 같으면 권한 항목을 모두 받습니다.
    # 넣지 않았거나 다르면 권한 0개로 가입합니다. 틀렸다고 가입을 거절하지는 않습니다.
    admin_code: str | None = Field(default=None, max_length=200)


class ProfileEditIn(BaseModel):
    name: str = Field(max_length=50)
    cohort: int | None = None


class PasswordChangeIn(BaseModel):
    current: str = Field(max_length=100)
    next: str = Field(max_length=100)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=100)
    # 로그인 상태 유지 여부입니다. False 이면 브라우저를 닫을 때 로그인이 해제됩니다.
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
    name: str | None


class UnavailableTimesOut(BaseModel):
    times: list[UnavailableOut]


class UnavailableEnvelopeOut(BaseModel):
    time: UnavailableOut


class UnavailableCreateIn(BaseModel):
    # NaiveDatetime 은 offset(+09:00)이 붙은 값을 422로 거부합니다. datetime 으로 받으면 offset 만
    # 삭제되어 9시간 어긋난 시각이 오류 없이 저장됩니다. 예약의 두 모델도 같은 이유로 같은 타입입니다.
    starts_at: NaiveDatetime
    ends_at: NaiveDatetime
    repeats_daily: bool = False
    repeats_weekly: bool = False
    repeat_until: date | None = None
    # 사유는 사용자가 입력하는 한 줄 문장입니다. 입력하지 않아도 등록됩니다.
    reason: str | None = Field(default=None, max_length=200)
    # 캘린더에 표시할 이름입니다. 길이 상한은 예약 이름(ReservationCreateIn.name)과 같습니다.
    name: str | None = Field(default=None, max_length=60)


class SettingsOut(BaseModel):
    # 예약과 배정이 쓰는 시간 칸의 크기(분)입니다.
    slot_minutes: int


class SettingsUpdateIn(BaseModel):
    # 한 시간을 남김없이 나누는 값만 받습니다. DB 의 CHECK 와 같은 조건을 경계에서도 봅니다.
    slot_minutes: Literal[5, 10, 12, 15, 20, 30, 60]


class ReservationOut(BaseModel):
    id: int
    room_id: int
    room: str
    team_id: int | None
    team: str | None
    member_id: int
    member: str
    # 캘린더에 표시할 이름입니다. 비어 있으면 화면이 팀 이름이나 예약자 이름을 대신 씁니다.
    name: str | None
    start: datetime
    end: datetime


class ReservationsOut(BaseModel):
    reservations: list[ReservationOut]


class ReservationCreateIn(BaseModel):
    # 예약자는 요청 본문이 아니라 인증 cookie 로 확인한 요청자입니다.
    room_id: int
    team_id: int | None = None
    name: str | None = Field(default=None, max_length=60)
    starts_at: NaiveDatetime
    ends_at: NaiveDatetime


class ReservationUpdateIn(BaseModel):
    # 이동할 시각만 받습니다. 합주실·팀·예약자는 원래 예약의 값을 그대로 사용합니다.
    starts_at: NaiveDatetime
    ends_at: NaiveDatetime


class NotificationOut(BaseModel):
    id: int
    # 알림의 종류만 포함합니다. 사람이 읽을 문장은 화면이 이 값으로 만듭니다.
    kind: NotificationKind
    created_at: str
    read: bool


class NotificationsOut(BaseModel):
    notifications: list[NotificationOut]


class FindIdIn(BaseModel):
    # 길이 상한은 SignupIn·LoginIn 과 같은 값입니다. 로그인 없이 열려 있는 endpoint 라
    # 길이를 제한하지 않으면 긴 문자열을 계속 보내는 것만으로 서버 자원을 소모시킬 수 있습니다.
    name: str = Field(max_length=100)
    email: str = Field(max_length=254)


class PasswordResetIn(BaseModel):
    email: str = Field(max_length=254)


class PasswordResetConfirmIn(BaseModel):
    # token 은 secrets.token_urlsafe(32) 가 생성한 43글자입니다. 상한 100 은 그보다 큽니다.
    token: str = Field(max_length=100)
    password: str = Field(max_length=100)


class AckOut(BaseModel):
    # 아이디 찾기와 비밀번호 재설정 요청이 함께 사용합니다. 계정이 있든 없든 이 응답 하나만
    # 반환해야 그 이메일이 가입되어 있는지가 응답으로 드러나지 않습니다.
    ok: bool = True
