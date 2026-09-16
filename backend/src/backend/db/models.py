# 이 파일은 공유 선언입니다. table(데이터베이스의 행과 열로 이루어진 데이터 구조)·
# 필드 정의만 담고, api·services·jobs 와 db 가 그대로 참조합니다.
# 계산·판단이 필요하면 이 파일이 아니라 호출하는 쪽에 둡니다.

from datetime import date, datetime, time
from typing import Literal, get_args

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    FetchedValue,
    ForeignKey,
    Index,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# scheduling 의 진입점(pipeline.py)이 아니라 slots.py 를 직접 참조합니다. 진입점을 거치면 이 파일을
# import 하는 migration 까지 OR-Tools 를 로드하게 됩니다. DEFAULT_SLOT_MINUTES 는 계산 없는 상수라 공유 선언입니다.
from backend.scheduling.slots import DEFAULT_SLOT_MINUTES

# 권한 항목입니다. 생성·수정·삭제·조회를 따로 두어, permission set(권한 집합)을 만드는 사람이
# 필요한 항목만 선택해 묶을 수 있게 합니다. 항목이 늘면 그 항목을 처리하는 서버 코드도
# 같이 늘어나므로 데이터가 아니라 이 코드에 고정합니다. 활성화/비활성화 여부만 permission_sets 에
# 저장합니다.
Permission = Literal[
    "room_create",  # 합주실 생성
    "room_edit",  # 합주실 여는 시각·닫는 시각 수정
    "period_create",  # 기간 생성
    "period_edit",  # 기간 수정
    "period_delete",  # 기간 삭제(그 기간의 배정 결과·계산 기록·이전 배정기록도 함께 삭제)
    "team_create",  # 팀 생성
    "team_edit",  # 팀 이름·포지션 구성 수정
    "team_delete",  # 팀 삭제
    "member_add",  # 팀 포지션에 멤버 배정
    "member_remove",  # 팀 포지션에서 다른 멤버 제외
    "member_expel",  # 멤버 추방(계정 삭제)
    "notice_write",  # 공지 작성
    "board_moderate",  # 다른 사용자의 글·댓글 삭제와 글 블라인드(수정은 작성자만 가능)
    "reservation_manage",  # 다른 사용자의 예약 수정·취소
    "assign_run",  # 배정 계산 실행
    "assign_read",  # 계산 결과·조율안 조회
    "proposal_confirm",  # 조율안 확정
    "rollback",  # 되돌리기
    "permission_manage",  # permission set 생성·수정·삭제
    "permission_grant",  # 멤버에게 permission set 부여·회수
]

PERMISSIONS: tuple[Permission, ...] = get_args(Permission)

# CHECK 제약 문구는 위 목록에서 그대로 생성합니다. 목록과 제약이 분리되지 않도록 합니다.
_PERMISSION_ARRAY_SQL = "ARRAY[{}]::text[]".format(
    ", ".join(f"'{name}'" for name in PERMISSIONS)
)

# 팀 색입니다. @radix-ui/colors 의 이름 25개 중 바로 옆 색과 거의 같은 5개(ruby, violet, bronze, cyan, grass)를
# 뺀 20개입니다(사용자 결정 2026-09-15). 순서가 곧 자동 배정 순서입니다. 화면 쪽 짝은 frontend/src/lib/teamColors.ts 입니다.
TeamColor = Literal[
    "tomato", "red", "crimson", "pink", "plum", "purple", "iris", "indigo", "blue", "sky",
    "teal", "jade", "green", "mint", "lime", "yellow", "amber", "orange", "gold", "brown",
]

TEAM_COLORS: tuple[TeamColor, ...] = get_args(TeamColor)

_TEAM_COLOR_ARRAY_SQL = "ARRAY[{}]::text[]".format(
    ", ".join(f"'{name}'" for name in TEAM_COLORS)
)

# 기간의 종류입니다. 집중 합주기간(focused)만 자동 배정이 실행됩니다.
PeriodKind = Literal["open", "focused"]
PERIOD_KINDS: tuple[PeriodKind, ...] = get_args(PeriodKind)

# 팀을 생성할 때 선택하는 포지션 종류입니다. 자리 하나가 이 중 하나를 할당받습니다.
# 같은 포지션을 2자리 이상 두면 ordinal(순서 번호)로 구분합니다. 예: 일렉 2자리는
# (일렉, 1)과 (일렉, 2)입니다.
Instrument = Literal["보컬", "일렉", "통기타", "베이스", "신디", "드럼"]
INSTRUMENTS: tuple[Instrument, ...] = get_args(Instrument)


def _in_sql(column: str, allowed: tuple[str, ...]) -> str:
    # column(데이터베이스의 열)과 허용 목록을 받아 "column IN ('a', 'b')" 형식으로 반환합니다.
    return "{} IN ({})".format(column, ", ".join(f"'{value}'" for value in allowed))


class Base(DeclarativeBase):
    pass


class Settings(Base):
    """저장소 전체에 하나뿐인 설정입니다. id 가 1 로 못박혀 있어 행이 둘 이상 생기지 않습니다.

    값마다 허용 범위가 달라 키·값 table 로 두지 않고 열로 둡니다. 그래야 CHECK 로 지킬 수 있습니다.
    """

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 예약과 배정이 쓰는 시간 칸의 크기입니다. 한 시간을 남김없이 나누어야 격자가 고르게
    # 떨어지므로 60 의 약수만 받습니다.
    # server_default 는 DB 가 적용하는 기본값입니다. default 만 두면 이 프로그램을 거치지 않는
    # INSERT(psql, migration)에서 값이 비어 NOT NULL 에 걸립니다.
    slot_minutes: Mapped[int] = mapped_column(
        default=DEFAULT_SLOT_MINUTES, server_default=text(str(DEFAULT_SLOT_MINUTES))
    )

    __table_args__ = (
        CheckConstraint("id = 1"),
        CheckConstraint("slot_minutes BETWEEN 5 AND 60 AND 60 % slot_minutes = 0"),
    )


class Member(Base):
    """사용자를 나타냅니다. 동명이인이 있을 수 있으므로 이름에 고유 조건을 두지 않습니다.
    ID가 식별자입니다.

    email 과 password_hash 는 로그인 계정 정보입니다. 명단에만 등록되고 아직 가입하지 않은
    사용자는 email 과 password_hash 가 null 입니다. 가입해야만 로그인 계정이 됩니다.
    수행 가능한 작업은 member_permission_sets 가 참조하는 permission set(권한 집합)이 정합니다.

    cohort 는 기수(입학 연도를 구분하는 번호)입니다. 연도로 환산하지 않고
    숫자를 그대로 저장합니다.

    시스템은 사용자를 id 로 식별하지만, 사용자가 다른 사용자를 구분하는 값은
    이름, 학과, 학번, 기수 4가지입니다(사용자 결정). 그 조합에 unique 제약을 두어
    같은 사용자가 중복으로 등록되지 않도록 합니다. 이름 하나만으로는
    동명이인을 구분할 수 없습니다.

    학과와 학번은 이 제약이 추가되기 전에 등록된 행에는 null 입니다. PostgreSQL 은
    NULL 이 있는 조합을 중복으로 보지 않으므로, 기존 행들이 서로 충돌하지 않습니다.
    """

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(Text, nullable=True)
    student_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    cohort: Mapped[int | None] = mapped_column(nullable=True)
    email: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("name", "department", "student_no", "cohort"),
    )


class PermissionSet(Base):
    """permission set(권한 집합)입니다. 이름이 식별자이므로 중복될 수 없고, permissions 는 활성화된 항목 목록입니다.

    description 은 이 permission set 을 어떤 역할의 사람에게 부여하는지 적는 열입니다. 항목
    목록만으로는 "왜 이 permission set 이 있는가"가 남지 않으므로, 생성할 때 반드시 입력받습니다.
    """

    __tablename__ = "permission_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    description: Mapped[str] = mapped_column(Text)
    permissions: Mapped[list[str]] = mapped_column(ARRAY(Text))

    # <@ 는 왼쪽 배열이 오른쪽 배열에 전부 들어 있는지 보는 연산자입니다. Permission 에
    # 없는 이름이 하나라도 섞이면 거절합니다.
    __table_args__ = (
        CheckConstraint(f"permissions <@ {_PERMISSION_ARRAY_SQL}", name="permission_sets_permissions_valid"),
    )


class MemberPermissionSet(Base):
    """멤버가 가진 permission set 하나입니다. 한 멤버가 permission set 을 2개 이상 가질 수 있고, 실제 권한은 그 합집합입니다."""

    __tablename__ = "member_permission_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    permission_set_id: Mapped[int] = mapped_column(
        ForeignKey("permission_sets.id", ondelete="CASCADE")
    )

    __table_args__ = (UniqueConstraint("member_id", "permission_set_id"),)


class Team(Base):
    """팀입니다. 이름이 식별자이므로 중복될 수 없습니다.

    팀이 어떤 포지션을 몇 자리 갖는지는 team_slots 가 저장합니다. 팀을 생성할 때
    포지션마다 자리 수를 정하면 그만큼 자리가 생성되고, 그 자리에 멤버를 배정합니다.

    color 는 TEAM_COLORS 중 하나이고 다른 팀과 겹칠 수 없습니다. 값을 주지 않고 INSERT 하면 DB 트리거
    (teams_pick_color)가 다른 팀이 쓰지 않는 첫 색을 채웁니다(migration c3f7b2e84d19). FetchedValue 는
    그 값을 DB 가 정한다고 ORM 에 알려, INSERT 뒤 채워진 색을 다시 읽게 합니다.
    """

    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    color: Mapped[str] = mapped_column(Text, unique=True, server_default=FetchedValue())

    __table_args__ = (
        CheckConstraint(f"color = ANY ({_TEAM_COLOR_ARRAY_SQL})", name="teams_color_valid"),
    )


class TeamSlot(Base):
    """팀의 포지션 자리 하나입니다. (team_id, instrument, ordinal) 이 자리를 식별하고, member_id 가
    그 자리에 배정된 멤버입니다.

    member_id 가 null 이면 아직 멤버가 배정되지 않은 자리입니다. 팀을 생성할 때 자리부터
    생성되고 멤버는 나중에 배정하므로, 멤버가 없는 자리가 정상 상태입니다. 그래서 이 table 은
    "소속"이 아니라 "자리"를 저장합니다.

    멤버가 삭제되면 그 자리는 member_id 가 null 이 되고 자리 자체는 삭제되지 않습니다(ON DELETE SET NULL).
    자리는 팀의 구성이므로 멤버가 탈퇴해도 팀의 자리 수가 줄면 안 됩니다.

    한 멤버가 같은 팀의 두 자리에 배정될 수 없습니다(team_id, member_id unique 제약). 배정되면 배정 계산이
    그 멤버를 같은 시간에 2번 세기 때문입니다. 빈 자리끼리는 이 제약에 위반되지 않습니다. PostgreSQL 이
    NULL 을 서로 다른 값으로 보기 때문입니다.
    """

    __tablename__ = "team_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    instrument: Mapped[Instrument] = mapped_column(Text)
    ordinal: Mapped[int] = mapped_column()
    member_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("team_id", "instrument", "ordinal"),
        UniqueConstraint("team_id", "member_id"),
        CheckConstraint(_in_sql("instrument", INSTRUMENTS)),
        CheckConstraint("ordinal >= 1"),
    )


class UnavailableTime(Base):
    """멤버의 불가능 시간입니다. 반복이 켜지면 repeat_until 까지 매일 또는 매주 반복합니다.

    시각은 tzinfo(시간대 정보)가 없는 값으로 저장합니다. 엔진의 TimeInterval 과 같은 규칙입니다.

    반복은 repeats_daily 와 repeats_weekly 두 열로 저장합니다. 둘 다 켜는 것은 의미가 없으므로
    경계에서 거부합니다(services/input.py 의 require_one_repeat_cycle). 하나의 열로 합치지 않는 이유는
    이미 repeats_weekly 로 저장된 행이 있기 때문입니다.

    reason 은 사용자가 입력하는 사유입니다. 엔진은 사용하지 않고 화면에만 표시합니다. null 을 허용합니다.
    name 은 캘린더에 표시할 이름입니다. 비어 있으면 화면이 "불가능 일정"으로 표시합니다.
    """

    __tablename__ = "unavailable_times"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    repeats_daily: Mapped[bool] = mapped_column(Boolean, default=False)
    repeats_weekly: Mapped[bool] = mapped_column(Boolean, default=False)
    repeat_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    name: Mapped[str | None] = mapped_column(String(60), nullable=True)

    __table_args__ = (CheckConstraint("ends_at > starts_at"),)


class Room(Base):
    """합주실입니다. 이름이 식별자이므로 중복될 수 없고, 여는 시각과 닫는 시각은 정시여야 합니다."""

    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    opens_at: Mapped[time] = mapped_column(Time)
    closes_at: Mapped[time] = mapped_column(Time)

    __table_args__ = (
        CheckConstraint(
            "date_part('minute', opens_at) = 0"
            " AND date_part('second', opens_at) = 0"
        ),
        CheckConstraint(
            "date_part('minute', closes_at) = 0"
            " AND date_part('second', closes_at) = 0"
        ),
        CheckConstraint("closes_at > opens_at", name="rooms_closes_after_opens"),
    )


class Period(Base):
    """기간입니다. kind 가 open 이면 선착순 예약 기간, focused 면 자동 배정 대상인 집중 합주기간입니다.

    everyday 는 집중 합주기간의 "매일" 옵션입니다. first_run_at 과 second_run_at 은 하루 2회 계산하는 시각입니다.

    ensemble_* 다섯 열은 전체합주 설정입니다(patch_note 8번). 날짜 범위·합주실·기본 시작/끝 시각을 함께 채우거나
    함께 비웁니다. 비어 있으면 전체합주가 없는 기간입니다. 날짜마다 다른 시각은 ensemble_days 가 저장합니다.
    """

    __tablename__ = "periods"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(Text)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    everyday: Mapped[bool] = mapped_column(Boolean, default=False)
    first_run_at: Mapped[time] = mapped_column(Time)
    second_run_at: Mapped[time] = mapped_column(Time)
    ensemble_starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ensemble_ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ensemble_room_id: Mapped[int | None] = mapped_column(ForeignKey("rooms.id"), nullable=True)
    ensemble_starts_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    ensemble_ends_at: Mapped[time | None] = mapped_column(Time, nullable=True)

    # 집중 합주기간끼리의 날짜 겹침 금지 제약(EXCLUDE)은 Reservation 의 겹침 금지 제약과 같이 migration 에만
    # 둡니다(migrations/versions/b5e1d9a37c42_focused_period_no_overlap.py).
    # ensemble 제약은 migration d9a4c6e1f207 과 같은 이름·조건입니다. 위반 문장을 이 이름으로 찾습니다.
    __table_args__ = (
        CheckConstraint(_in_sql("kind", PERIOD_KINDS)),
        CheckConstraint("ends_on >= starts_on"),
        CheckConstraint(
            "num_nulls(ensemble_starts_on, ensemble_ends_on, ensemble_room_id,"
            " ensemble_starts_at, ensemble_ends_at) IN (0, 5)",
            name="periods_ensemble_all_or_none",
        ),
        CheckConstraint(
            "ensemble_starts_on IS NULL OR kind = 'focused'",
            name="periods_ensemble_focused_only",
        ),
        CheckConstraint(
            "ensemble_starts_on IS NULL OR (ensemble_starts_on >= starts_on"
            " AND ensemble_ends_on >= ensemble_starts_on AND (everyday OR ensemble_ends_on <= ends_on))",
            name="periods_ensemble_within_period",
        ),
        CheckConstraint(
            "ensemble_ends_at > ensemble_starts_at", name="periods_ensemble_times_order"
        ),
    )


class EnsembleDay(Base):
    """전체합주 날짜 하나의 시각입니다. 기간의 기본 시각(Period.ensemble_starts_at·ensemble_ends_at)과 다르게
    지정한 날짜만 행이 있습니다. 날짜가 전체합주 날짜 범위 안인지는 다른 table 의 값이라 서비스가 검사합니다."""

    __tablename__ = "ensemble_days"

    id: Mapped[int] = mapped_column(primary_key=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("periods.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    starts_at: Mapped[time] = mapped_column(Time)
    ends_at: Mapped[time] = mapped_column(Time)

    __table_args__ = (
        UniqueConstraint("period_id", "day"),
        CheckConstraint("ends_at > starts_at"),
    )


class AssignmentRun(Base):
    """자동 배정이 완료된 계산 1회의 기록입니다. 같은 기간·같은 날짜·같은 계산 시각은 1개만 저장됩니다.

    slot 은 Period 의 어느 계산 시각인지입니다. 'first' 는 first_run_at, 'second' 는
    second_run_at 입니다. ran_at 은 계산이 완료된 시각입니다.
    """

    __tablename__ = "assignment_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    period_id: Mapped[int] = mapped_column(
        ForeignKey("periods.id", ondelete="CASCADE")
    )
    run_on: Mapped[date] = mapped_column(Date)
    slot: Mapped[str] = mapped_column(Text)
    ran_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        UniqueConstraint("period_id", "run_on", "slot"),
        CheckConstraint("slot IN ('first', 'second')"),
    )


class Assignment(Base):
    """확정된 배정 한 구간입니다. 같은 팀이 같은 합주실에서 이어 쓰는 칸은 쪼개지 않고 한 행으로 저장합니다.

    같은 합주실에서 시간이 겹치는 행은 DB 가 거절합니다(assignments_no_overlap). 예약과 같은 방식입니다.
    """

    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    period_id: Mapped[int] = mapped_column(
        ForeignKey("periods.id", ondelete="CASCADE")
    )
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)

    # 겹침 금지 제약(EXCLUDE)은 SQLAlchemy 로 표현할 수 없어 migration 이 직접 만듭니다
    # (migrations/versions/a1f7c30e9b52_assignment_as_one_row.py). index 는 표현할 수 있으므로
    # 여기 적습니다. 빠뜨리면 다음 autogenerate 가 지우는 migration 을 만들어 냅니다.
    __table_args__ = (
        Index("ix_assignments_room_starts_at", "room_id", "starts_at"),
        CheckConstraint("ends_at > starts_at"),
    )


class Post(Base):
    """게시판 글입니다. team_id 가 있으면 그 팀 게시판 글, NULL 이면 공지사항입니다.

    같은 table 을 두 화면이 공유하므로 화면과 endpoint(API의 요청 주소 단위)도 하나씩만 둡니다.
    """

    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    # index 를 둡니다. 공지 목록(team_id IS NULL)과 팀 게시판 목록(team_id = 값) 모두
    # 이 열 하나로 필터링하므로, btree index 하나를 두 조회가 모두 사용합니다. PostgreSQL 의 btree 는
    # NULL 도 index 에 포함하므로 IS NULL 조회에도 사용됩니다.
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime)
    # 값이 있으면 그 시각에 가려진 글입니다. 가려진 글은 목록과 상세에서 빠지고 작성자 본인도 볼 수
    # 없습니다. board_moderate 를 가진 사람이 격리 목록에서만 봅니다.
    blinded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 가린 사람입니다. 그 계정이 삭제되면 이 값만 비웁니다 — author_id 처럼 CASCADE 로 두면
    # 관리자 계정 하나를 지울 때 그 사람이 가린 글이 전부 삭제됩니다.
    blinded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )

    # 값이 없으면 아직 쓰는 중인 초안입니다. 작성 페이지를 열 때 먼저 만들고, 발행할 때 이 값을 채웁니다.
    # 본문에 파일을 넣으려면 글 번호가 있어야 하는데 첨부 업로드가 POST /posts/{id}/attachments 라,
    # 글을 먼저 만들지 않으면 쓰는 중에 파일을 올릴 수 없습니다(사용자 결정 2026-09-16).
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        # 초안은 제목과 본문이 비어 있습니다. 발행한 글만 내용을 요구합니다.
        CheckConstraint(
            "published_at IS NULL OR length(trim(title)) > 0", name="posts_published_title"
        ),
        CheckConstraint(
            "published_at IS NULL OR length(trim(body)) > 0", name="posts_published_body"
        ),
        # 목록 조회는 전부 blinded_at IS NULL 과 published_at IS NOT NULL 을 붙입니다.
        # 부분 index 라 목록에 나오는 행만 담습니다.
        Index(
            "ix_posts_visible",
            "team_id",
            postgresql_where=text("blinded_at IS NULL AND published_at IS NOT NULL"),
        ),
    )


class Comment(Base):
    """게시글의 댓글입니다."""

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (CheckConstraint("length(trim(body)) > 0", name="comments_body_not_blank"),)


class Attachment(Base):
    """게시글의 첨부 파일 하나입니다. 파일 내용은 서버 디스크에 있고 이 table 에는 그 위치만 저장합니다.

    name 은 화면에 표시할 이름, stored_name 은 디스크에 저장된 파일 이름입니다.
    """

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(
        ForeignKey("posts.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(Text)
    stored_name: Mapped[str] = mapped_column(Text, unique=True)
    size: Mapped[int] = mapped_column(BigInteger)
    content_type: Mapped[str] = mapped_column(Text)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0"),
        CheckConstraint("size >= 0"),
    )


class Reservation(Base):
    """예약 한 건입니다. 사람이 고른 구간을 쪼개지 않고 starts_at~ends_at 한 행으로 저장합니다.

    같은 합주실에서 시간이 겹치는 행은 DB 가 거절합니다(reservations_no_overlap). 선착순은
    그 제약이 commit 시점에 정합니다.

    name 은 캘린더에 표시할 이름입니다. 비어 있으면 화면이 팀 이름을, 팀도 없으면 예약자
    이름을 대신 씁니다.

    team_id 가 있으면 팀 예약, 없으면 member_id 멤버의 개인 예약입니다.

    cancelled_at 이 있으면 취소된 예약입니다. 취소해도 행을 지우지 않고, 이동하면 옛 행을 취소 표시로
    두고 새 행을 만듭니다. 겹침 금지 제약은 취소된 행을 보지 않습니다(migration f4c2a9d17b63).
    """

    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"))
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # 겹침 금지 제약(EXCLUDE)은 SQLAlchemy 로 표현할 수 없어 migration 이 직접 만듭니다
    # (migrations/versions/f4c2a9d17b63_reservation_cancelled_at.py). index 는 표현할 수
    # 있으므로 여기 적습니다. 빠뜨리면 다음 autogenerate 가 "메타데이터에 없는 index" 로
    # 보고 지우는 migration 을 만들어 냅니다.
    __table_args__ = (
        Index("ix_reservations_room_starts_at", "room_id", "starts_at"),
        CheckConstraint("ends_at > starts_at"),
    )


class LoginSession(Base):
    """로그인 session(로그인 상태를 담는 서버 쪽 기록) 하나입니다. token 원문이 아니라 해시(token_hash)만
    저장합니다. DB 가 유출되어도 해시 값으로는 로그인할 수 없습니다. revoked_at 이 설정되거나
    expires_at 이 지나면 무효입니다.

    class 이름을 LoginSession 으로 둔 이유는 SQLAlchemy 의 Session 과 겹치지 않게 하기 위해서입니다.
    """

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AssignmentBackup(Base):
    """이전 배정의 백업입니다. 다시 계산할 때 현행 table(assignments)의 행을 이 table 로 옮깁니다.

    현행과 같은 구간 한 행입니다.

    saved_at 은 백업된 시각입니다. 같은 기간의 여러 백업 배정기록을 구분하고 정렬하는 기준입니다.
    현행 table 과 달리 여러 배정기록이 공존하므로 겹침 금지 제약을 두지 않습니다.
    """

    __tablename__ = "assignment_backups"

    id: Mapped[int] = mapped_column(primary_key=True)
    period_id: Mapped[int] = mapped_column(
        ForeignKey("periods.id", ondelete="CASCADE")
    )
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    saved_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (CheckConstraint("ends_at > starts_at"),)


# 알림의 종류입니다. 문구는 이 코드에 두지 않습니다. table 에는 종류만 저장하고 사람이 읽을
# 문장은 화면이 만듭니다. 그래서 문구를 수정하면 이미 저장된 알림에도 적용되고, table 을
# 수정할 필요가 없습니다.
NotificationKind = Literal["assignment_updated"]
NOTIFICATION_KINDS: tuple[NotificationKind, ...] = get_args(NotificationKind)


class Notification(Base):
    """멤버 1명에게 표시하는 화면 알림 하나입니다. read_at 이 null 이면 아직 읽지 않은 알림입니다.

    읽음 여부를 알림마다 두는 이유는 나중에 알림을 하나씩 읽는 화면이 생겨도 table 을 변경할
    필요가 없기 때문입니다. "언제까지 읽었다"는 값 하나로 두면 그때 table 을 다시 만들어야 합니다.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 목록 조회는 언제나 요청한 사용자의 행만 반환하므로 이 열 하나로 필터링합니다.
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[NotificationKind] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (CheckConstraint(_in_sql("kind", NOTIFICATION_KINDS)),)


class PasswordResetToken(Base):
    """비밀번호 재설정 token 하나입니다. sessions table 과 같은 구조로 원문이 아니라 해시만
    저장합니다. DB 가 유출되어도 해시 값으로는 비밀번호를 변경할 수 없습니다.

    used_at 이 설정되거나 expires_at 이 지나면 무효입니다. 한 번 사용하면 무효가 되므로 sessions 의
    revoked_at 과 달리 열 이름이 used_at 입니다.
    """

    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
