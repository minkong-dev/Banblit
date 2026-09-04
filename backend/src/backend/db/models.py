# 이것은 공유 선언이다 — 표·필드 정의만 담고, api 와 db 양쪽이 그대로 참조한다.
# 계산·판단이 필요하면 이 파일이 아니라 부르는 쪽에 둔다.

from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Member(Base):
    """사람. 동명이인이 있을 수 있으므로 이름에 고유 조건을 두지 않는다 — id가 식별자다.

    email·password_hash·role은 로그인 계정 정보다. 스케줄링에만 쓰이고 아직
    가입하지 않은 사람은 이 셋이 비어 있다 — 가입해야 로그인 계정이 된다.
    """

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(Text, default="member", server_default="member")

    __table_args__ = (CheckConstraint("role IN ('head_manager', 'member')"),)


class Position(Base):
    """악기 포지션. 정해진 목록에서 고른다 — 목록은 데이터로 관리한다."""

    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)


class Team(Base):
    """팀. 이름이 식별자이므로 겹칠 수 없다."""

    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)


class Membership(Base):
    """소속 = 사람 + 팀 + 포지션 한 묶음. 같은 사람이 같은 팀에 두 번 들어갈 수 없다."""

    __tablename__ = "memberships"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE")
    )
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    position_id: Mapped[int] = mapped_column(
        ForeignKey("positions.id", ondelete="RESTRICT")
    )

    __table_args__ = (UniqueConstraint("member_id", "team_id"),)


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
