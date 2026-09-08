# 이 파일은 공유 선언이다 — table·필드 정의만 담고, api 와 db 양쪽이 그대로 참조한다.
# 계산·판단이 필요하면 이 파일이 아니라 부르는 쪽에 둔다.

from datetime import date, datetime, time
from typing import Literal, get_args

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# 할 수 있는 일. 만들기·수정·삭제·주기를 따로 두어, 권한을 만드는 사람이 필요한 것만
# 골라 묶을 수 있게 한다. 항목이 늘면 그것을 막는 서버 코드도 같이 늘어나므로 데이터가
# 아니라 여기에 고정한다. 켜고 끄는 것만 permission_sets 에 저장한다.
Permission = Literal[
    "room_create",  # 합주실 만들기
    "room_edit",  # 합주실 여닫는 시각 고치기
    "period_create",  # 기간 만들기
    "period_edit",  # 기간 고치기
    "team_create",  # 팀 만들기
    "team_edit",  # 팀 이름 바꾸기
    "team_delete",  # 팀 지우기
    "member_add",  # 팀 포지션에 사람 넣기
    "member_remove",  # 팀 포지션에서 사람 빼기
    "notice_write",  # 공지 쓰기
    "board_moderate",  # 남의 글·댓글 수정·삭제
    "reservation_manage",  # 남의 예약 수정·취소
    "assign_run",  # 배정 계산 실행
    "assign_read",  # 계산 결과·조율안 보기
    "proposal_confirm",  # 조율안 확정
    "rollback",  # 되돌리기
    "permission_manage",  # 권한 만들기·수정·삭제
    "permission_grant",  # 사람에게 권한 주고 뺏기
]

PERMISSIONS: tuple[Permission, ...] = get_args(Permission)

# CHECK 문구는 위 목록에서 그대로 만든다 — 목록과 제약이 따로 놀지 않게 한다.
_PERMISSION_ARRAY_SQL = "ARRAY[{}]::text[]".format(
    ", ".join(f"'{name}'" for name in PERMISSIONS)
)

# 팀을 만들 때 고르는 악기. 자리 하나가 이 중 하나를 맡는다. 같은 악기를 여럿 두면
# ordinal 로 갈린다 — 일렉 두 자리는 (일렉, 1) 과 (일렉, 2) 다.
# 기간의 종류. 집중 합주기간(focused)만 자동 배정이 돈다.
PeriodKind = Literal["open", "focused"]
PERIOD_KINDS: tuple[PeriodKind, ...] = get_args(PeriodKind)

Instrument = Literal["보컬", "일렉", "통기타", "베이스", "신디", "드럼"]
INSTRUMENTS: tuple[Instrument, ...] = get_args(Instrument)


def _in_sql(column: str, allowed: tuple[str, ...]) -> str:
    # column 과 허용 목록을 받아 "column IN ('a', 'b')" 문구를 돌려준다.
    return "{} IN ({})".format(column, ", ".join(f"'{value}'" for value in allowed))


class Base(DeclarativeBase):
    pass


class Member(Base):
    """사람. 동명이인이 있을 수 있으므로 이름에 고유 조건을 두지 않는다 — id가 식별자다.

    email·password_hash는 로그인 계정 정보다. 스케줄링에만 쓰이고 아직
    가입하지 않은 사람은 이 둘이 비어 있다 — 가입해야 로그인 계정이 된다.
    할 수 있는 일은 member_permission_sets 가 가리키는 권한들이 정한다.

    cohort 는 기수다 — 연도로 환산하지 않고 숫자를 그대로 담는다.

    사람을 가르는 것은 id 이지만, 사람이 사람을 가르는 값은 이름·학과·학번·기수 네
    가지다(사용자 결정). 그 조합에 고유 조건을 걸어 같은 사람이 두 번 들어오지 않게
    한다. 이름 하나만으로는 동명이인이 갈리지 않는다.

    학과·학번은 이 조건이 생기기 전에 들어온 행에는 비어 있다. Postgres 는 NULL 이
    낀 조합을 겹침으로 보지 않으므로, 옛 행들이 서로 부딪히지 않는다.
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
    """권한 묶음. 이름이 식별자라 겹칠 수 없고, permissions 는 켜진 항목 목록이다.

    description 은 이 권한이 무엇을 하는 사람에게 주는 것인지를 적는 자리다. 항목
    목록만으로는 "왜 이 묶음이 있는가"가 남지 않아, 만들 때 반드시 적게 한다.
    """

    __tablename__ = "permission_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    description: Mapped[str] = mapped_column(Text)
    permissions: Mapped[list[str]] = mapped_column(ARRAY(Text))

    # <@ 는 왼쪽 배열이 오른쪽 배열에 전부 들어 있는지 보는 연산자다. Permission 에
    # 없는 이름이 하나라도 섞이면 거절한다.
    __table_args__ = (
        CheckConstraint(f"permissions <@ {_PERMISSION_ARRAY_SQL}"),
    )


class MemberPermissionSet(Base):
    """사람이 가진 묶음 하나. 한 사람이 여럿을 가질 수 있고, 실제 권한은 그 합집합이다."""

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
    """팀. 이름이 식별자이므로 겹칠 수 없다.

    팀이 어떤 악기를 몇 자리 갖는지는 team_slots 가 들고 있다 — 팀을 만들 때
    악기마다 몇 명인지 정하면 그만큼 자리가 생기고, 그 자리를 사람으로 채운다.
    """

    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)


class TeamSlot(Base):
    """팀의 악기 자리 하나. (팀 + 악기 + 몇 번째) 가 자리를 가리키고, member_id 가
    그 자리에 앉은 사람이다.

    member_id 가 비어 있으면 아직 아무도 안 앉은 자리다 — 팀을 만들 때 자리부터
    생기고 사람은 나중에 채우므로, 사람이 없는 자리가 정상 상태다. 그래서 이 표는
    "소속"이 아니라 "자리"다.

    사람이 지워지면 그 자리는 비워지되 사라지지는 않는다 — 자리는 팀의 구성이라
    사람이 나갔다고 팀에 구멍이 나면 안 된다.

    한 사람이 같은 팀의 두 자리를 겸할 수 없다. 겸하면 배정 계산이 그 사람을 같은
    시간에 두 번 세게 된다. 빈 자리끼리는 이 조건에 걸리지 않는다 — 저장소가 빈 값을
    서로 다른 값으로 보기 때문이다.
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
    """멤버의 불가능 시간. repeats_weekly가 켜지면 repeat_until까지 매주 반복.

    시각은 시간대 없는 값으로 저장한다 — 엔진의 TimeInterval 계약과 동일.
    """

    __tablename__ = "unavailable_times"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    repeats_weekly: Mapped[bool] = mapped_column(Boolean, default=False)
    repeat_until: Mapped[date | None] = mapped_column(Date, nullable=True)

    __table_args__ = (CheckConstraint("ends_at > starts_at"),)


class Room(Base):
    """합주실. 이름이 식별자라 겹칠 수 없고, 여닫는 시각은 정시여야 한다."""

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
        CheckConstraint("closes_at > opens_at"),
    )


class Period(Base):
    """기간. open이면 선착순 예약, focused면 자동 배정 대상.

    everyday는 집중기간의 "매일" 옵션. first/second_run_at은 하루 2회 연산 시각.
    """

    __tablename__ = "periods"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(Text)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    everyday: Mapped[bool] = mapped_column(Boolean, default=False)
    first_run_at: Mapped[time] = mapped_column(Time)
    second_run_at: Mapped[time] = mapped_column(Time)

    __table_args__ = (
        CheckConstraint(_in_sql("kind", PERIOD_KINDS)),
        CheckConstraint("ends_on >= starts_on"),
    )


class AssignmentRun(Base):
    """자동 배정이 끝난 연산 시각 하나. 같은 기간·같은 날짜·같은 시각은 한 번만 남는다.

    slot 은 Period 의 어느 연산 시각인지다 — 'first'는 first_run_at, 'second'는
    second_run_at. ran_at 은 계산이 끝난 시각이다.
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
    """확정된 배정 한 칸. 같은 방의 같은 시각에는 하나만 존재할 수 있다."""

    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    period_id: Mapped[int] = mapped_column(
        ForeignKey("periods.id", ondelete="CASCADE")
    )
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        UniqueConstraint("room_id", "starts_at"),
        CheckConstraint("ends_at > starts_at"),
    )


class Post(Base):
    """게시판 글. team_id 가 있으면 그 팀 게시판 글, NULL 이면 공지사항이다.

    같은 표를 두 화면이 공유하므로 화면·통로도 한 벌만 두면 된다.
    """

    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 색인을 붙인다 — 공지 목록(team_id IS NULL)과 팀 게시판 목록(team_id = 값) 모두
    # 이 한 열로 거르므로, btree 색인 하나면 두 조회 다 걸린다. Postgres의 btree는
    # NULL도 색인하므로 IS NULL 조회에도 그대로 쓰인다.
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0"),
        CheckConstraint("length(trim(body)) > 0"),
    )


class Comment(Base):
    """게시글 댓글."""

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

    __table_args__ = (CheckConstraint("length(trim(body)) > 0"),)


class Attachment(Base):
    """글에 붙은 파일 하나. 내용은 서버 디스크에 있고 이 표에는 그 위치만 있다.

    name 은 화면에 보여줄 이름, stored_name 은 디스크에 놓인 이름이다.
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
    """예약 한 칸 — 집중 합주기간이 아닌 날의 한 시간.

    Assignment와 같은 결로 방·시각당 하나만 존재한다(room_id, starts_at 유니크).
    여러 칸을 이어 쓴 예약은 이 표에 칸 수만큼 행으로 남는다 — 화면이 Assignment 조각을
    잇는 것과 같은 방식으로 이어붙인다.
    team_id가 있으면 팀 예약, 없으면 member_id 개인이 직접 잡은 예약이다.
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
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    __table_args__ = (
        UniqueConstraint("room_id", "starts_at"),
        CheckConstraint("ends_at > starts_at"),
    )


class LoginSession(Base):
    """로그인 세션 한 건. 토큰 원문이 아니라 해시(token_hash)만 저장한다 — DB가 새어도
    그 값으로는 로그인하지 못한다. revoked_at이 채워지거나 expires_at이 지나면 무효.

    클래스 이름을 LoginSession으로 둔 것은 SQLAlchemy의 Session과 겹치지 않기 위해서다.
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
    """이전 배정 스냅샷. 재연산 때 현행(assignments)에서 이리로 옮긴다.

    saved_at은 백업된 시각이다 — 같은 기간의 여러 백업을 구분하고 정렬하는 기준.
    현행과 달리 여러 회차가 공존하므로 room+시각 유니크를 두지 않는다.
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


# 알릴 만한 일의 종류. 문구는 여기 두지 않는다 — 표에는 종류만 남기고 사람이 읽을
# 문장은 화면이 만든다. 문구를 고칠 때 이미 쌓인
# 줄까지 함께 바뀌고, 표에 손댈 일도 없다.
NotificationKind = Literal["assignment_updated"]
NOTIFICATION_KINDS: tuple[NotificationKind, ...] = get_args(NotificationKind)


class Notification(Base):
    """사람 한 명에게 남은 화면 안 알림 하나. read_at 이 비어 있으면 아직 안 읽은 것이다.

    읽음을 알림마다 두는 것은 나중에 하나씩 읽는 화면이 생겨도 표가 그대로이기
    때문이다. "언제까지 읽었다" 한 값으로 두면 그때 표를 다시 만들어야 한다.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 목록 조회는 언제나 "내 것만"이라 이 한 열로 거른다.
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[NotificationKind] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (CheckConstraint(_in_sql("kind", NOTIFICATION_KINDS)),)


class PasswordResetToken(Base):
    """비밀번호 재설정 토큰 한 건. 세션(sessions)과 같은 얼개로 원문이 아니라 해시만
    저장한다 — DB가 새어도 그 값으로는 비밀번호를 바꾸지 못한다.

    used_at이 채워지거나 expires_at이 지나면 무효다. 한 번 쓰면 죽으므로 sessions의
    revoked_at과 달리 이름이 used_at이다.
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
