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

# 할 수 있는 일 열한 가지. 항목이 늘면 그것을 막는 서버 코드도 같이 늘어나므로
# 데이터가 아니라 여기에 고정한다. 켜고 끄는 것만 permission_sets 에 저장한다.
Permission = Literal[
    "room_manage",  # 합주실 만들기·고치기
    "period_manage",  # 기간 만들기·고치기
    "team_manage",  # 팀 만들기·이름 바꾸기
    "member_remove",  # 팀에서 남을 빼기
    "join_approve",  # 팀 참가 신청 보기·승인·거절
    "assign_run",  # 배정 계산 실행
    "assign_read",  # 계산 결과·조율안 보기
    "proposal_confirm",  # 조율안 확정
    "rollback",  # 되돌리기
    "notice_write",  # 공지 쓰기
    "permission_grant",  # 남에게 권한 주기
]

PERMISSIONS: tuple[Permission, ...] = get_args(Permission)

# CHECK 문구는 위 목록에서 그대로 만든다 — 목록과 제약이 따로 놀지 않게 한다.
_PERMISSION_ARRAY_SQL = "ARRAY[{}]::text[]".format(
    ", ".join(f"'{name}'" for name in PERMISSIONS)
)

# 팀마다 고르는 참가 승인 방식과, 그 결과로 소속 행이 갖는 상태.
JoinPolicy = Literal["auto", "approval"]
JOIN_POLICIES: tuple[JoinPolicy, ...] = get_args(JoinPolicy)

MembershipStatus = Literal["approved", "pending"]
MEMBERSHIP_STATUSES: tuple[MembershipStatus, ...] = get_args(MembershipStatus)


def _in_sql(column: str, allowed: tuple[str, ...]) -> str:
    # column 과 허용 목록을 받아 "column IN ('a', 'b')" 문구를 돌려준다.
    return "{} IN ({})".format(column, ", ".join(f"'{value}'" for value in allowed))


class Base(DeclarativeBase):
    pass


class Member(Base):
    """사람. 동명이인이 있을 수 있으므로 이름에 고유 조건을 두지 않는다 — id가 식별자다.

    email·password_hash는 로그인 계정 정보다. 스케줄링에만 쓰이고 아직
    가입하지 않은 사람은 이 둘이 비어 있다 — 가입해야 로그인 계정이 된다.
    할 수 있는 일은 member_permission_sets 가 가리키는 묶음들이 정한다.
    """

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)


class PermissionSet(Base):
    """권한 묶음. 이름이 식별자라 겹칠 수 없고, permissions 는 켜진 항목 목록이다."""

    __tablename__ = "permission_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
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


class Position(Base):
    """악기 포지션. 정해진 목록에서 고른다 — 목록은 데이터로 관리한다."""

    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)


class Team(Base):
    """팀. 이름이 식별자이므로 겹칠 수 없다.

    join_policy 가 "auto" 면 참가 요청이 바로 소속이 되고, "approval" 이면
    join_approve 항목을 가진 사람이 승인해야 소속이 된다.
    """

    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    join_policy: Mapped[JoinPolicy] = mapped_column(Text, server_default="auto")

    __table_args__ = (CheckConstraint(_in_sql("join_policy", JOIN_POLICIES)),)


class Membership(Base):
    """소속 = 사람 + 팀 + 포지션 한 묶음. 같은 사람이 같은 팀에 두 번 들어갈 수 없다.

    status 가 "pending" 인 행은 아직 소속이 아니라 신청이다 — 명단·인원 수·게시판·
    예약·배정 명단 어디에도 들어가지 않는다. 유일 조건은 두 상태를 가리지 않으므로
    신청과 소속이 겹쳐 생기지도 않는다.
    """

    __tablename__ = "memberships"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    position_id: Mapped[int] = mapped_column(
        ForeignKey("positions.id", ondelete="RESTRICT")
    )
    status: Mapped[MembershipStatus] = mapped_column(Text, server_default="approved")

    __table_args__ = (
        UniqueConstraint("member_id", "team_id"),
        CheckConstraint(_in_sql("status", MEMBERSHIP_STATUSES)),
    )


class MemberPosition(Base):
    """가입할 때 고른 포지션. 팀마다 다른 Membership.position_id와 달리 팀에 매이지
    않는, 계정 전체 기준의 포지션 목록이라 다대다 표를 따로 둔다."""

    __tablename__ = "member_positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    position_id: Mapped[int] = mapped_column(
        ForeignKey("positions.id", ondelete="RESTRICT")
    )

    __table_args__ = (UniqueConstraint("member_id", "position_id"),)


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
    """합주실. 이름이 식별자라 겹칠 수 없고, 여닫는 시각은 30분 격자 위여야 한다."""

    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    opens_at: Mapped[time] = mapped_column(Time)
    closes_at: Mapped[time] = mapped_column(Time)

    __table_args__ = (
        CheckConstraint(
            "date_part('minute', opens_at) IN (0, 30)"
            " AND date_part('second', opens_at) = 0"
        ),
        CheckConstraint(
            "date_part('minute', closes_at) IN (0, 30)"
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
        CheckConstraint("kind IN ('open', 'focused')"),
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
        ForeignKey("members.id", ondelete="RESTRICT")
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
        ForeignKey("members.id", ondelete="RESTRICT")
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
    """상시 개방기간의 30분 자리 예약 한 칸.

    Assignment와 같은 결로 방·시각당 하나만 존재한다(room_id, starts_at 유니크).
    여러 칸을 이어 쓴 예약은 이 표에 칸 수만큼 행으로 남는다 — 화면의 mergeSessions가
    Assignment 조각을 잇는 것과 같은 방식으로 이어붙일 수 있게 하려는 것이다.
    team_id가 있으면 팀 예약, 없으면 member_id 개인이 직접 잡은 예약이다.
    """

    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"))
    team_id: Mapped[int | None] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), nullable=True
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="RESTRICT")
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
# 문장은 화면(frontend/src/lib/notifications.ts)이 만든다. 문구를 고칠 때 이미 쌓인
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
