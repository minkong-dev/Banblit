from sqlalchemy import ForeignKey, Text, UniqueConstraint
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
