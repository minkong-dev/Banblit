# 이 파일은 공유 선언입니다. table(데이터베이스의 행과 열로 이루어진 데이터 구조)·
# 필드 정의만 담고, api·services·jobs 와 db 가 그대로 참조합니다.
# 계산·판단이 필요하면 이 파일이 아니라 호출하는 쪽에 둡니다.

from datetime import date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    FetchedValue,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# 칸 크기와 합주 1회 길이는 db·api·services·scheduling 이 같은 값을 참조해야 하므로 공유 규격
# 파일에 1세트만 둡니다.
from backend.contract import (
    DEFAULT_DAILY_MAX_HOURS,
    DEFAULT_MAX_CONSECUTIVE_HOURS,
    DEFAULT_SESSION_MINUTES,
    DEFAULT_SLOT_MINUTES,
    Instrument,
    INSTRUMENTS,
    LATEST_CLOSE_NEXT_DAY,
    MAX_DAILY_HOURS,
    MAX_SESSION_MINUTES,
    NOTIFICATION_KINDS,
    NotificationKind,
    Permission,
    PERIOD_KINDS,
    PERMISSIONS,
    REJECT_TARGETS,
    RUN_SLOTS,
    SLOT_MINUTE_CHOICES,
    TEAM_COLORS,
)

# CHECK 제약 문구는 위 목록에서 그대로 생성합니다. 목록과 제약이 분리되지 않도록 합니다.
_PERMISSION_ARRAY_SQL = "ARRAY[{}]::text[]".format(
    ", ".join(f"'{name}'" for name in PERMISSIONS)
)

_TEAM_COLOR_ARRAY_SQL = "ARRAY[{}]::text[]".format(
    ", ".join(f"'{name}'" for name in TEAM_COLORS)
)


def _slot_minutes_sql() -> str:
    """settings.slot_minutes 의 CHECK 제약 문구를 SLOT_MINUTE_CHOICES 에서 생성합니다."""
    return "slot_minutes IN ({})".format(
        ", ".join(str(value) for value in SLOT_MINUTE_CHOICES)
    )


def _in_sql(column: str, allowed: tuple[str, ...]) -> str:
    # column(데이터베이스의 열)과 허용 목록을 받아 "column IN ('a', 'b')" 형식으로 반환합니다.
    return "{} IN ({})".format(column, ", ".join(f"'{value}'" for value in allowed))


def _clock_range_sql(starts: str, ends: str) -> str:
    # 하루 중의 범위입니다. ends 가 starts 보다 늦거나, ends 가 LATEST_CLOSE_NEXT_DAY(다음 날 00:00)이면서 starts 와 다를 때 통과합니다.
    midnight = f"'{LATEST_CLOSE_NEXT_DAY}'"
    return f"({ends} > {starts} OR ({ends} = {midnight} AND {starts} <> {midnight}))"


class Base(DeclarativeBase):
    pass


class Settings(Base):
    """서비스 전체에 1개뿐인 설정입니다. CHECK 제약(id = 1)이 있어 행이 2개 이상 생성되지 않습니다.

    값마다 허용 범위가 달라 키·값 table 로 두지 않고 열로 둡니다. 그래야 CHECK 로 지킬 수 있습니다.
    """

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 예약과 배정이 쓰는 slot 의 크기(분)입니다. slot 경계가 정시와 맞도록 60 의 약수만 허용합니다.
    # server_default 는 DB 가 적용하는 기본값입니다. default 만 두면 이 프로그램을 거치지 않는
    # INSERT(psql, migration)에서 값이 비어 NOT NULL 에 걸립니다.
    slot_minutes: Mapped[int] = mapped_column(
        default=DEFAULT_SLOT_MINUTES, server_default=text(str(DEFAULT_SLOT_MINUTES))
    )
    # 합주 1회가 이어지는 길이입니다. 칸의 배수여야 합주가 칸 중간에서 끝나지 않습니다.
    session_minutes: Mapped[int] = mapped_column(
        default=DEFAULT_SESSION_MINUTES,
        server_default=text(str(DEFAULT_SESSION_MINUTES)),
    )

    __table_args__ = (
        CheckConstraint("id = 1"),
        # 허용 값은 contract.py 의 SLOT_MINUTE_CHOICES 에 작성되어 있는 내용을 기준으로 합니다. 목록에서 생성해,
        # 값을 추가할 때 이 줄을 함께 수정하지 않아도 되게 합니다.
        CheckConstraint(_slot_minutes_sql()),
        # 합주 길이는 칸의 배수이고 칸보다 짧을 수 없습니다. 두 열을 함께 보는 조건이라
        # 열 하나의 CHECK 로는 지킬 수 없어 table 단위로 둡니다. 한쪽만 바꿔 조건이 깨지는
        # UPDATE 도 이 제약이 거절합니다.
        CheckConstraint(
            "session_minutes >= slot_minutes"
            " AND session_minutes % slot_minutes = 0"
            f" AND session_minutes <= {MAX_SESSION_MINUTES}",
            name="settings_session_minutes_fits_slots",
        ),
    )


class Member(Base):
    """사용자입니다. id 가 식별자이고, 이름, 학과, 학번, 기수 조합이 unique 입니다.

    login_id 는 로그인 아이디, email 은 비밀번호 재설정과 아이디 찾기 메일 주소입니다. 가입 전 사용자는
    login_id, email, password_hash 가 null 입니다. 권한은 member_permission_sets 가 참조하는 권한 세트가 결정합니다.
    cohort 는 기수이고 숫자 그대로 저장합니다. 학과, 학번은 null 을 허용합니다.
    """

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    department: Mapped[str | None] = mapped_column(Text, nullable=True)
    student_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    cohort: Mapped[int | None] = mapped_column(nullable=True)
    email: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    login_id: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 프로필 사진의 저장 파일명입니다. 파일 자체는 첨부와 같은 폴더에 둡니다(avatar_service).
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("name", "department", "student_no", "cohort"),
    )


class PermissionSet(Base):
    """권한 세트(permission set)입니다. name 은 unique 이고, permissions 는 활성화된 권한 항목 목록입니다.

    description 은 이 권한 세트를 부여할 역할을 적는 열이고, 생성할 때 필수입니다.
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
    포지션마다 자리 수를 지정하면 그만큼 자리가 생성되고, 그 자리에 멤버를 배정합니다.

    color 는 TEAM_COLORS 중 하나이고 다른 팀과 겹칠 수 없습니다. 값을 주지 않고 INSERT 하면 DB 트리거
    (teams_pick_color)가 다른 팀이 쓰지 않는 첫 색을 채웁니다(migration c3f7b2e84d19). FetchedValue 는
    그 값을 DB 가 결정한다고 ORM 에 알려, INSERT 뒤 채워진 색을 다시 읽게 합니다.
    """

    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    color: Mapped[str] = mapped_column(Text, unique=True, server_default=FetchedValue())

    __table_args__ = (
        CheckConstraint(f"color = ANY ({_TEAM_COLOR_ARRAY_SQL})", name="teams_color_valid"),
    )


class TeamSlot(Base):
    """팀의 포지션 자리 1개입니다. (team_id, instrument, ordinal) 이 자리를 식별하고, member_id 가 배정된 멤버입니다.

    member_id 가 null 이면 빈 자리입니다. 멤버가 삭제되면 member_id 가 null 로 변경되고 자리는 유지됩니다(ON DELETE SET NULL).
    (team_id, member_id) 는 unique 이고, 빈 자리끼리는 이 제약에 위반되지 않습니다.
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
    """멤버의 불가능 일정입니다. repeat_weekdays 가 있으면 선택한 요일마다 반복합니다.

    시각은 tzinfo(시간대 정보)가 없는 값으로 저장합니다. 엔진의 TimeInterval 과 같은 규칙입니다.

    반복은 repeat_weekdays 하나로 저장합니다. 어느 요일에 반복할지를 담고, 매일 반복은 일곱 요일을
    전부 고른 것과 같습니다. 끝나는 조건은 repeat_count(횟수)나 repeat_until(종료일) 중 하나이고,
    둘 다 지정하면 경계에서 거부합니다(services/validation/input.py 의 require_repeat_end).

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
    # 반복할 요일의 집합입니다. 월요일이 1, 화요일이 2, 수요일이 4 … 일요일이 64 이고 더해서 저장합니다.
    # date.weekday() 와 같은 순서입니다. null 이거나 0 이면 반복하지 않습니다. 일곱 요일 전부(127)가 매일 반복입니다.
    repeat_weekdays: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # 반복 횟수입니다. 시작 회차를 포함해 셉니다. repeat_until 과 동시에 지정할 수 없습니다(services/validation/input.py).
    repeat_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repeat_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    name: Mapped[str | None] = mapped_column(String(60), nullable=True)

    __table_args__ = (CheckConstraint("ends_at > starts_at"),)


class Room(Base):
    """합주실입니다. name 은 unique 이고, opens_at 과 closes_at 은 정시여야 합니다."""

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
        CheckConstraint(_clock_range_sql("opens_at", "closes_at"), name="rooms_clock_range"),
    )


class Period(Base):
    """기간입니다. kind 가 open 이면 선착순 예약 기간, focused 이면 자동 배정 대상인 집중 합주기간입니다.

    everyday 는 집중 합주기간의 "매일" 옵션이고, first_run_at, second_run_at 은 하루 2회 계산 시각입니다.
    ensemble_* 5개 열은 전체 합주 설정이고 전부 값이 있거나 전부 null 입니다. 날짜마다 다른 시각은 ensemble_days 가 저장합니다.
    practice_* 4개 열은 팀별 합주를 배정할 수 있는 시간대이고 평일(월~금), 주말(토, 일)이 각각 1쌍입니다.
    null 인 쪽은 합주실 개방 시간 전체를 씁니다.
    """

    __tablename__ = "periods"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(Text)
    # 공연명입니다. 화면의 기간 목록 제목이고, 빈 문자열이면 화면이 종류 이름을 표시합니다.
    name: Mapped[str] = mapped_column(Text, default="", server_default="")
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
    practice_weekday_starts_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    practice_weekday_ends_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    practice_weekend_starts_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    practice_weekend_ends_at: Mapped[time | None] = mapped_column(Time, nullable=True)
    # 팀당 목표 시간입니다. null 이면 전체 시간 ÷ 팀 수를 씁니다(사용자 결정 2026-10-12).
    target_hours_per_team: Mapped[int | None] = mapped_column(nullable=True)
    # session 1회에서 불가능 일정 때문에 빠져도 되는 팀원 수의 상한입니다. 0 이면 팀 전원이 가능한 시간만 배정합니다.
    max_absent_members: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    # 팀 1개가 하루에 배정받는 시간의 상한과 끊기지 않고 이어지는 시간의 상한(시간)입니다(사용자 결정 2026-10-20).
    daily_max_hours: Mapped[int] = mapped_column(
        SmallInteger, default=DEFAULT_DAILY_MAX_HOURS, server_default=str(DEFAULT_DAILY_MAX_HOURS)
    )
    max_consecutive_hours: Mapped[int] = mapped_column(
        SmallInteger, default=DEFAULT_MAX_CONSECUTIVE_HOURS, server_default=str(DEFAULT_MAX_CONSECUTIVE_HOURS)
    )
    # 마감 일시와 확정 시각입니다(사용자 결정 2026-10-20). closes_at 이 지나면 그 기간 날짜의 불가능 일정을 막고,
    # jobs/auto_assign.py 가 1회 계산해 적용한 시각을 fixed_at 에 남깁니다. closes_at 이 null 이면 마감 없이 계속 계산합니다.
    closes_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fixed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

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
            _clock_range_sql("ensemble_starts_at", "ensemble_ends_at"), name="periods_ensemble_times_order"
        ),
        # 평일·주말은 각각 한 쌍입니다. 한쪽만 채우면 종료 시간 없는 시간대가 되어 배정 구간을
        # 정할 수 없습니다. 두 쌍은 서로 독립입니다 — 평일만 정하고 주말은 개방시각 전체로 둘 수 있습니다.
        CheckConstraint(
            "num_nulls(practice_weekday_starts_at, practice_weekday_ends_at) IN (0, 2)"
            " AND num_nulls(practice_weekend_starts_at, practice_weekend_ends_at) IN (0, 2)",
            name="periods_practice_window_pairs",
        ),
        CheckConstraint(
            f"({_clock_range_sql('practice_weekday_starts_at', 'practice_weekday_ends_at')}"
            " OR practice_weekday_starts_at IS NULL)"
            f" AND ({_clock_range_sql('practice_weekend_starts_at', 'practice_weekend_ends_at')}"
            " OR practice_weekend_starts_at IS NULL)",
            name="periods_practice_window_order",
        ),
        CheckConstraint("target_hours_per_team > 0", name="periods_target_hours_positive"),
        CheckConstraint("max_absent_members >= 0", name="periods_max_absent_not_negative"),
        CheckConstraint(f"daily_max_hours BETWEEN 1 AND {MAX_DAILY_HOURS}", name="periods_daily_max_hours_range"),
        CheckConstraint(
            "max_consecutive_hours BETWEEN 1 AND daily_max_hours", name="periods_max_consecutive_within_daily"
        ),
        CheckConstraint("fixed_at IS NULL OR closes_at IS NOT NULL", name="periods_fixed_needs_close"),
    )


class EnsembleDay(Base):
    """전체 합주 날짜 하나의 시각입니다. 기간의 기본 시각(Period.ensemble_starts_at·ensemble_ends_at)과 다르게
    지정한 날짜만 행이 있습니다. 날짜가 전체 합주 날짜 범위 안인지는 다른 table 의 값이라 서비스가 검사합니다."""

    __tablename__ = "ensemble_days"

    id: Mapped[int] = mapped_column(primary_key=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("periods.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    starts_at: Mapped[time] = mapped_column(Time)
    ends_at: Mapped[time] = mapped_column(Time)

    __table_args__ = (
        UniqueConstraint("period_id", "day"),
        CheckConstraint(_clock_range_sql("starts_at", "ends_at"), name="ensemble_days_clock_range"),
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
        CheckConstraint(_in_sql("slot", RUN_SLOTS)),
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
    # 여기 적습니다. 빠뜨리면 다음 autogenerate 가 삭제하는 migration 을 만들어 냅니다.
    __table_args__ = (
        Index("ix_assignments_room_starts_at", "room_id", "starts_at"),
        # 배정 저장·조회·삭제가 period_id 로 행을 찾습니다. PostgreSQL 은 외래 키에 index 를 자동으로 생성하지 않습니다.
        Index("ix_assignments_period_id", "period_id"),
        CheckConstraint("ends_at > starts_at"),
    )


class Post(Base):
    """게시판 글입니다. team_id 가 있으면 그 팀 게시판 글, NULL 이면 공지사항입니다.

    같은 table 을 공지사항과 팀 게시판이 공유합니다.
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
    # 값이 있으면 그 시각에 블라인드된 글입니다. 블라인드된 글은 목록과 상세에서 제외되고 작성자 본인도 조회할 수
    # 없습니다. board_moderate 를 가진 사람만 블라인드 목록에서 조회합니다.
    blinded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 가린 사람입니다. 그 계정이 삭제되면 이 값만 null 로 변경합니다 — author_id 처럼 CASCADE 로 두면
    # 관리자 계정 하나를 삭제할 때 그 사람이 가린 글이 전부 삭제됩니다.
    blinded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )

    # 값이 없으면 아직 쓰는 중인 초안입니다. 작성 페이지를 열 때 먼저 만들고, 발행할 때 이 값을 채웁니다.
    # 본문에 파일을 넣으려면 글 번호가 있어야 하는데 첨부 업로드가 POST /posts/{id}/attachments 라,
    # 글을 먼저 만들지 않으면 쓰는 중에 파일을 올릴 수 없습니다.
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
    """예약 1건입니다. 선택한 구간을 starts_at, ends_at 1행으로 저장합니다.

    team_id 가 있으면 팀 예약, 없으면 member_id 멤버의 개인 예약입니다. name 이 비어 있으면 화면이 팀 이름, 팀도 없으면 예약자 이름을 표시합니다.
    cancelled_at 이 있으면 취소된 예약입니다. 취소된 행을 제외한 행끼리의 겹침은 reservations_no_overlap 제약이 거부합니다.
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
    # 보고 삭제하는 migration 을 만들어 냅니다.
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
    """스케줄링 기록(연산 결과)입니다. 연산 1회의 결과가 같은 saved_at 의 행 묶음으로 쌓이고,
    관리자가 적용하면 그 행을 현행 table(assignments)로 복사합니다(사용자 결정 2026-10-13).

    현행과 같은 구간 한 행입니다.

    saved_at 은 연산한 시각입니다. 같은 기간의 여러 기록을 구분하고 정렬하는 기준입니다.
    현행 table 과 달리 여러 기록이 공존하므로 겹침 금지 제약을 두지 않습니다.
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
    # 이 기록을 마지막으로 현재 배정안에 적용한 시각입니다. 화면의 "n월 n일 확정" 표시입니다(사용자 결정 2026-10-15).
    # 한 기록의 행은 같은 값을 가집니다. 적용한 적 없으면 NULL 입니다.
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        # 같은 기간의 배정기록을 saved_at 으로 구분하고 정렬하므로 두 열을 묶습니다.
        Index("ix_assignment_backups_period_id_saved_at", "period_id", "saved_at"),
        CheckConstraint("ends_at > starts_at"),
    )





class Notification(Base):
    """멤버 1명에게 표시하는 화면 알림 하나입니다.

    읽음 처리는 행을 삭제합니다. 읽음 표시만 남기면 삭제되는 경로가 없어 행이 쌓이기만 합니다
    (services/notification/notification_service.py 의 mark_all_read). 그래서 읽음 여부 열을 두지 않습니다.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 목록 조회는 언제나 요청한 사용자의 행만 반환하므로 이 열 하나로 필터링합니다.
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[NotificationKind] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    # 아래 3개는 kind 가 rejected 일 때만 값을 가집니다. 무엇을(target), 언제 것을(target_starts_at),
    # 왜(reason) 반려했는지입니다. 화면이 이 값으로 "<언제> <무엇>이 반려되었어요" 문장을 만듭니다.
    # 반려된 불가능 일정은 행이 삭제되므로 대상의 번호가 아니라 시작 시간을 그대로 보관합니다.
    target: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(_in_sql("kind", NOTIFICATION_KINDS)),
        CheckConstraint(
            f"target IS NULL OR {_in_sql('target', REJECT_TARGETS)}",
            name="notifications_target_valid",
        ),
        # 반려 알림은 3개 값을 전부 가지고, 다른 알림은 전부 비워 둡니다. 하나만 빠진 반려 알림은
        # 화면이 문장을 만들 수 없습니다.
        CheckConstraint(
            "(kind = 'rejected') = (target IS NOT NULL AND target_starts_at IS NOT NULL AND reason IS NOT NULL)",
            name="notifications_rejected_fields",
        ),
        # 확정 해제 알림은 해제 사유를 reason 에 담습니다. 사유가 없으면 화면이 해제 이유를 표시할 수 없습니다.
        CheckConstraint("kind <> 'assignment_unfixed' OR reason IS NOT NULL", name="notifications_unfixed_reason"),
    )


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
