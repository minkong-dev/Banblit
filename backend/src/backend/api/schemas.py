from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, NaiveDatetime, model_validator

from backend.contract import PERMISSIONS, Instrument, JobStatus, NotificationKind, Permission, SlotMinutes
from backend.contract import (
    DEFAULT_DAILY_MAX_HOURS,
    DEFAULT_MAX_CONSECUTIVE_HOURS,
    MAX_DAILY_HOURS,
    MAX_SESSION_MINUTES,
    REJECT_REASON_MAX_LENGTH,
)

class RoomSlotOut(BaseModel):
    # 배정의 slot(점유 단위 길이의 시간 칸)입니다. 합주실은 DB의 번호와 이름을 함께 반환합니다.
    room_id: int
    room: str
    start: datetime
    end: datetime


class AssignmentOut(BaseModel):
    slots_by_team: dict[str, list[RoomSlotOut]]
    open_slots: list[RoomSlotOut]


class ShortfallOut(BaseModel):
    team_id: int
    team: str
    assigned_hours: float


class AbsenceOut(BaseModel):
    # 한 멤버는 한 팀에서 포지션 1개만 맡습니다(team_slots 의 (team_id, member_id) unique).
    team_id: int
    team: str
    member_id: int
    member: str
    cohort: int | None
    position: str
    sessions: int


class SessionAbsenceOut(BaseModel):
    # session 1회에 빠지는 팀원 1명입니다.
    team_id: int
    team: str
    start: datetime
    end: datetime
    member_id: int
    member: str
    cohort: int | None


class ScheduleReportOut(BaseModel):
    """시간표 하나의 부족분과 불참자입니다. 두 목록이 모두 비면 그 시간표는 확정할 수 있는 결과입니다."""

    target_hours: float
    shortfalls: list[ShortfallOut]
    absences: list[AbsenceOut]
    session_absences: list[SessionAbsenceOut]
    # session 1회라도 빠지는 인원이 불참 허용 인원을 넘으면 true 입니다. 화면이 현재 배정안 경고에 씁니다.
    over_absent: bool


class ScheduleRowOut(BaseModel):
    team_id: int
    team: str
    room_id: int
    room: str
    start: datetime
    end: datetime


class ScheduleOut(BaseModel):
    # open_slots 는 어느 팀도 배정받지 않은 slot(점유 단위 길이의 시간 칸)입니다. 집중 합주기간 안의 slot 이라
    # 예약 대상이 아니고, 화면은 사용하지 않습니다.
    rows: list[ScheduleRowOut]
    open_slots: list[RoomSlotOut]
    # 확정 시간표가 없으면 null 입니다.
    report: ScheduleReportOut | None


class PeriodAssignIn(BaseModel):
    team_ids: list[int] = Field(min_length=1, max_length=20)
    room_ids: list[int] = Field(min_length=1, max_length=10)


class RecordScoreOut(BaseModel):
    """기록 하나의 점수입니다. 앞 항목이 우선하고, absences 만 적을수록 좋습니다."""

    fewest: int
    sessions: int
    absences: int
    joined: int
    # 100점 만점 점수입니다(record_points).
    points: int


class RecordOut(BaseModel):
    # 스케줄링 기록을 구분하는 값은 저장 시각입니다. assignment_backups에 별도 기록 번호가 없습니다.
    saved_at: datetime
    slot_count: int
    # 마지막으로 적용한 시각입니다. 적용한 적 없으면 null 입니다.
    applied_at: datetime | None
    # 조회 시점의 불가능 일정으로 매긴 점수입니다. 집중 합주기간이 아니면 null 입니다.
    score: RecordScoreOut | None


class RecordsOut(BaseModel):
    records: list[RecordOut]


class RecordRoundOut(BaseModel):
    # 스케줄링 기록 1개의 시간표입니다. 현재 배정안(ScheduleOut)과 row(데이터베이스 행) 구조는 같지만
    # open_slots는 없습니다. 지나간 기록에 예약을 개방할 필요가 없습니다.
    rows: list[ScheduleRowOut]
    report: ScheduleReportOut | None


class PeriodAssignOut(BaseModel):
    assignment: AssignmentOut
    report: ScheduleReportOut
    # 쌓은 스케줄링 기록의 saved_at 입니다. 배정이 0건이면 기록이 없어 null 입니다.
    record_saved_at: datetime | None


class ApplyRecordOut(BaseModel):
    applied: bool


class JobOut(BaseModel):
    id: str
    period_id: int
    status: JobStatus
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


class ClockRangeOut(BaseModel):
    starts_at: str
    ends_at: str


class PracticeWindowOut(BaseModel):
    """팀별 합주를 배정할 수 있는 하루 중의 시간대입니다. 합주실 개방시각과는 다른 값입니다.

    null 인 쪽은 시간대를 정하지 않았다는 뜻이고, 그날은 합주실 개방시각 전체를 씁니다.
    두 쌍은 서로 독립입니다 — 평일만 좁히고 주말은 열어 둘 수 있습니다.
    """

    weekday: ClockRangeOut | None
    weekend: ClockRangeOut | None


class PracticeWindowIn(BaseModel):
    """시간대 전체를 한 번에 대체합니다. 두 쌍을 모두 null 로 보내면 시간대를 삭제합니다.

    PATCH 에서 이 값을 보내지 않으면 저장된 시간대를 유지합니다. 다른 값만 수정하는 요청이 시간대를 삭제하지 않도록
    보내지 않은 경우와 null 을 보낸 경우를 구분합니다.
    """

    weekday: ClockRangeOut | None = None
    weekend: ClockRangeOut | None = None


class AssignRuleOut(BaseModel):
    """배정 규칙입니다. target_hours 가 null 이면 팀당 목표 시간은 전체 시간 ÷ 팀 수입니다.

    daily_max_hours 는 팀 1개가 하루에 배정받는 시간의 상한, max_consecutive_hours 는 끊기지 않고 이어지는 시간의 상한(시간)입니다.
    """

    target_hours: int | None
    max_absent: int
    daily_max_hours: int
    max_consecutive_hours: int


class AssignRuleIn(BaseModel):
    """배정 규칙 전체를 한 번에 대체합니다. PATCH 에서 보내지 않으면 저장값을 그대로 둡니다(PracticeWindowIn 과 같은 방식).

    max_consecutive_hours 가 daily_max_hours 이하인지는 services/period/period_crud_service.py 의 AssignRuleIn 이 판정합니다.
    """

    target_hours: int | None = Field(default=None, gt=0)
    max_absent: int = Field(default=0, ge=0, le=32767)
    daily_max_hours: int = Field(default=DEFAULT_DAILY_MAX_HOURS, ge=1, le=MAX_DAILY_HOURS)
    max_consecutive_hours: int = Field(default=DEFAULT_MAX_CONSECUTIVE_HOURS, ge=1, le=MAX_DAILY_HOURS)


class PeriodOut(BaseModel):
    id: int
    kind: str
    # 공연명입니다. 비어 있을 수 있습니다.
    name: str
    starts_on: str
    ends_on: str
    everyday: bool
    first_run_at: str
    second_run_at: str
    # 지정하지 않은 쌍은 null 입니다. practice_window 자체는 항상 객체이므로 화면은 weekday, weekend 만 null 검사합니다.
    practice_window: PracticeWindowOut
    assign_rule: AssignRuleOut
    # 전체 합주를 지정하지 않은 기간은 null 입니다.
    ensemble: EnsembleOut | None
    # 마감 일시입니다. 지정하지 않은 기간은 null 입니다.
    closes_at: datetime | None
    # 마감 일시가 지나 배정을 확정한 시각입니다. 확정되지 않은 기간은 null 입니다.
    fixed_at: datetime | None


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
    name: str = ""
    starts_on: str
    ends_on: str
    everyday: bool
    first_run_at: str
    second_run_at: str
    # 생략하면 시간대를 정하지 않은 기간이 됩니다.
    practice_window: PracticeWindowIn | None = None
    # 생략하면 목표 시간 자동, 불참 허용 0명입니다.
    assign_rule: AssignRuleIn | None = None
    # 생략하면 마감 일시가 없는 기간입니다. 시간대를 붙이면 422 입니다.
    closes_at: datetime | None = None


class PeriodUpdateIn(BaseModel):
    kind: str | None = None
    name: str | None = None
    starts_on: str | None = None
    ends_on: str | None = None
    everyday: bool | None = None
    first_run_at: str | None = None
    second_run_at: str | None = None
    # 보내지 않으면 저장된 시간대를 유지합니다. 삭제하려면 두 쌍이 null 인 객체를 보냅니다.
    practice_window: PracticeWindowIn | None = None
    # 보내지 않으면 저장된 배정 규칙을 그대로 둡니다.
    assign_rule: AssignRuleIn | None = None
    # 보내지 않으면 저장된 마감 일시를 유지하고, null 을 보내면 삭제합니다. router 가 model_fields_set 으로 구분합니다.
    closes_at: datetime | None = None


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


class SlotMemberIn(BaseModel):
    """자리 1개의 배정 결과입니다. member_id 가 None 이면 그 자리의 배정을 해제합니다."""

    slot_id: int
    member_id: int | None = None


class SlotMembersIn(BaseModel):
    """팀 화면이 저장 버튼 1번에 보내는 자리 배정 전체입니다.

    자리마다 요청을 보내면 중간 요청이 실패했을 때 앞선 요청만 반영된 상태로 끝납니다.
    이 모델로 한 번에 수신해 transaction 1개로 처리합니다.
    """

    assignments: list[SlotMemberIn]


class MemberOut(BaseModel):
    id: int
    name: str
    # 사용자를 구분하는 값은 이름, 학과, 학번, 기수 4가지입니다. 이 제약이
    # 추가되기 전에 등록된 사용자는 학과와 학번이 null 입니다.
    department: str | None = None
    student_no: str | None = None
    cohort: int | None = None


class MemberRowOut(MemberOut):
    """멤버 화면의 1행입니다. 가진 권한 세트 이름이 함께 포함됩니다."""

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
    # 블라인드한 사람의 이름입니다. 블라인드되지 않은 글은 None 이고, 값이 있는 응답은 블라인드 목록(GET /blinded-posts)뿐입니다.
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
    # 명단에만 등록되고 아직 가입하지 않은 계정은 없지만(가입해야 로그인해 이 응답을 받으므로),
    # Member.login_id 자체는 null 을 허용하는 열이라 타입을 그대로 맞춥니다.
    login_id: str | None
    # 프로필 사진의 저장 파일명입니다. 사진이 없으면 null 입니다. 화면은 이 값이 바뀌는 것을 보고
    # 사진을 다시 불러옵니다 — 사진 주소는 계정 번호로 고정이라 값이 없으면 옛 사진이 남습니다.
    avatar: str | None
    # role 은 permissions 에서 계산한 값입니다. PERMISSIONS 의 항목 전부가 설정되어 있으면
    # head_manager 입니다. 화면이 아직 이 값으로 label(화면에 표시되는 텍스트)을
    # 선택하고 있어 함께 제공합니다.
    role: Literal["head_manager", "member"]
    permissions: list[Permission]
    # 가진 permission set 의 이름입니다. 화면은 "헤드매니저" 고정 문구 대신 이 이름을 역할로 표시합니다.
    permission_sets: list[str]
    # 기수입니다. 화면이 동명이인을 구분할 때 이름 옆에 표시합니다.
    cohort: int | None = None
    # 학과입니다. 프로필 화면이 이름 아래에 표시합니다. 이 열이 추가되기 전에 가입한 계정은 null 입니다.
    department: str | None = None


class PermissionSetIn(BaseModel):
    name: str = Field(max_length=50)
    # 이 permission set 을 어떤 역할의 사람에게 부여하는지 설명하는 문장입니다. 빈 값을 허용하지 않습니다.
    description: str = Field(max_length=200)
    # 상한은 항목 수에서 유도합니다. 숫자를 적어 두면 항목을 추가할 때 이 줄을 함께 수정해야 하고,
    # 수정하지 않으면 모든 항목을 선택한 요청이 거절됩니다.
    permissions: list[Permission] = Field(max_length=len(PERMISSIONS))


class PermissionSetMemberOut(BaseModel):
    """권한 세트를 가진 사용자 1명입니다. id 로 사용자를 식별하고, name 은 화면 표시에 씁니다."""

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
    login_id: str = Field(max_length=20)
    password: str = Field(max_length=100)
    # 기수입니다. 1981년이 1기지만 연도로 환산하지 않고 숫자를 그대로 받습니다.
    cohort: int
    # 관리자코드입니다. 환경변수 ADMIN_SIGNUP_CODE 와 같을 경우 권한 항목을 모두 받습니다.
    # 보내지 않았거나 다를 경우 권한 0개로 가입하고, 가입을 거절하지 않습니다.
    admin_code: str | None = Field(default=None, max_length=200)


class ProfileEditIn(BaseModel):
    name: str = Field(max_length=50)
    cohort: int | None = None


class PasswordChangeIn(BaseModel):
    current: str = Field(max_length=100)
    next: str = Field(max_length=100)


class LoginIn(BaseModel):
    login_id: str = Field(max_length=20)
    password: str = Field(max_length=100)
    # 로그인 상태 유지 여부입니다. False 이면 브라우저를 닫을 때 로그인이 해제됩니다.
    keep: bool = False


class UnavailableOut(BaseModel):
    id: int
    member_id: int
    starts_at: datetime
    ends_at: datetime
    # 반복할 요일의 집합입니다. 월요일 1, 화요일 2, 수요일 4 … 일요일 64 를 더한 값입니다.
    # null 이면 반복하지 않고, 127 이면 매일입니다.
    repeat_weekdays: int | None
    # 반복 횟수입니다. 시작 회차를 포함해 셉니다. repeat_until 과 동시에 지정할 수 없습니다.
    repeat_count: int | None
    repeat_until: date | None
    reason: str | None
    name: str | None



class UnavailableTimesOut(BaseModel):
    times: list[UnavailableOut]


class MemberUnavailableOut(UnavailableOut):
    """멤버 전체의 불가능 일정 1건입니다. 누구의 일정인지 표시해야 하므로 이름이 함께 옵니다.

    번호만 반환하면 화면이 명단을 한 번 더 조회해 번호를 이름으로 바꿔야 합니다.
    """

    member: str


class AllUnavailableOut(BaseModel):
    times: list[MemberUnavailableOut]


class UnavailableEnvelopeOut(BaseModel):
    time: UnavailableOut


class UnavailableCreateIn(BaseModel):
    # NaiveDatetime 은 offset(+09:00)이 붙은 값을 422로 거부합니다. datetime 으로 받으면 offset 만
    # 삭제되어 9시간 어긋난 시각이 오류 없이 저장됩니다. 예약의 두 모델도 같은 이유로 같은 타입입니다.
    starts_at: NaiveDatetime
    ends_at: NaiveDatetime
    # 반복할 요일의 집합입니다. 월요일 1 부터 일요일 64 까지 더한 값이고 상한은 127 입니다.
    repeat_weekdays: int | None = Field(default=None, ge=0, le=127)
    # 반복 횟수입니다. 1 이상이어야 하고 repeat_until 과 동시에 보내면 422 로 거부합니다.
    repeat_count: int | None = Field(default=None, ge=1)
    repeat_until: date | None = None
    # 사유는 사용자가 입력하는 한 줄 문장입니다. 입력하지 않아도 등록됩니다.
    reason: str | None = Field(default=None, max_length=200)
    # 캘린더에 표시할 이름입니다. 길이 상한은 예약 이름(ReservationCreateIn.name)과 같습니다.
    name: str | None = Field(default=None, max_length=60)


class SettingsOut(BaseModel):
    # 예약과 배정이 쓰는 시간 칸의 크기(분)입니다. 합주를 시작할 수 있는 간격이기도 합니다.
    slot_minutes: int
    # 합주 1회가 이어지는 길이(분)입니다.
    session_minutes: int


class SettingsUpdateIn(BaseModel):
    """바꿀 값만 담습니다. 보내지 않은 값은 그대로 둡니다.

    두 값이 한 요청에 담길 수 있어야 합니다. 30분 합주로 내리려면 칸도 30분이어야 하는데,
    요청을 나누면 어느 쪽을 먼저 보내도 중간 상태가 조건을 어겨 거절됩니다.
    """

    # 한 시간을 남김없이 나누는 값만 받습니다. DB 의 CHECK 와 같은 조건을 경계에서도 봅니다.
    # 허용 값은 contract.py 의 SlotMinutes 에 작성되어 있는 내용을 기준으로 합니다.
    slot_minutes: SlotMinutes | None = None
    # session_minutes 가 slot_minutes 의 배수인지는 저장된 slot_minutes 가 필요하므로 services/settings/settings_service.py 가 판정합니다.
    # 이 schema 는 값 1개로 판정할 수 있는 범위만 검증합니다.
    session_minutes: int | None = Field(default=None, ge=1, le=MAX_SESSION_MINUTES)

    @model_validator(mode="after")
    def _at_least_one(self) -> "SettingsUpdateIn":
        # 빈 요청을 200 으로 응답하면 field 이름을 잘못 적은 요청이 error 없이 무시됩니다.
        if self.slot_minutes is None and self.session_minutes is None:
            raise ValueError("변경할 값을 1개 이상 보내주세요")
        return self


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
    # kind 가 rejected 일 때만 값이 있고 그 밖에는 null 입니다. 반려된 대상(contract.REJECT_TARGETS 중 하나),
    # 그 대상의 시작 시간, 반려 사유입니다.
    target: str | None
    target_starts_at: datetime | None
    reason: str | None


class RejectIn(BaseModel):
    """다른 멤버의 예약·불가능 일정을 반려할 때 받는 본문입니다. 두 대상이 같은 본문을 씁니다."""

    # 앞뒤 공백 제거와 빈 사유 거부는 service 가 합니다(validation 의 require_reject_reason).
    reason: str = Field(max_length=REJECT_REASON_MAX_LENGTH)


class UnfixIn(BaseModel):
    """기간의 확정을 해제할 때 받는 본문입니다. 사유 길이 상한은 반려 사유와 같습니다."""

    # 앞뒤 공백 제거와 빈 사유 거부는 service 가 합니다(period 의 unfix_period).
    reason: str = Field(max_length=REJECT_REASON_MAX_LENGTH)


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
