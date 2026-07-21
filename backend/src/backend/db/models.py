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
    """사람. 동명이인이 있을 수 있으므로 이름에 고유 조건을 두지 않는다 — id가 식별자다."""

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)


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
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"))
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    position_id: Mapped[int] = mapped_column(ForeignKey("positions.id"))

    __table_args__ = (UniqueConstraint("member_id", "team_id"),)


class UnavailableTime(Base):
    """멤버의 불가능 시간. repeats_weekly가 켜지면 repeat_until까지 매주 반복.

    시각은 시간대 없는 값으로 저장한다 — 엔진의 TimeInterval 계약과 동일.
    """

    __tablename__ = "unavailable_times"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"))
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
    )
