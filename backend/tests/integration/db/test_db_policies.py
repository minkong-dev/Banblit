from datetime import date, datetime, time

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import (
    Assignment,
    Member,
    Membership,
    Period,
    Position,
    Room,
    Team,
    UnavailableTime,
)


def test_room_closing_before_opening_is_rejected(db_session: Session) -> None:
    db_session.add(Room(name="1번방", opens_at=time(20, 0), closes_at=time(18, 0)))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_deleting_a_member_removes_their_memberships_and_unavailable_times(
    db_session: Session,
) -> None:
    member = Member(name="김민수")
    team = Team(name="A")
    guitar = db_session.scalars(select(Position).where(Position.name == "기타")).one()
    db_session.add_all([member, team])
    db_session.flush()
    db_session.add(
        Membership(member_id=member.id, team_id=team.id, position_id=guitar.id)
    )
    db_session.add(
        UnavailableTime(
            member_id=member.id,
            starts_at=datetime(2026, 7, 21, 18, 0),
            ends_at=datetime(2026, 7, 21, 20, 0),
        )
    )
    db_session.commit()
    member_id = member.id

    db_session.execute(delete(Member).where(Member.id == member_id))
    db_session.commit()

    remaining_memberships = db_session.scalars(
        select(Membership).where(Membership.member_id == member_id)
    ).all()
    remaining_unavailable_times = db_session.scalars(
        select(UnavailableTime).where(UnavailableTime.member_id == member_id)
    ).all()
    assert remaining_memberships == []
    assert remaining_unavailable_times == []


def test_deleting_a_team_removes_its_assignments(db_session: Session) -> None:
    period = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 14),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(22, 0))
    team = Team(name="A")
    db_session.add_all([period, room, team])
    db_session.flush()
    db_session.add(
        Assignment(
            period_id=period.id,
            team_id=team.id,
            room_id=room.id,
            starts_at=datetime(2026, 8, 1, 19, 0),
            ends_at=datetime(2026, 8, 1, 19, 30),
        )
    )
    db_session.commit()
    team_id = team.id

    db_session.execute(delete(Team).where(Team.id == team_id))
    db_session.commit()

    remaining_assignments = db_session.scalars(
        select(Assignment).where(Assignment.team_id == team_id)
    ).all()
    assert remaining_assignments == []


def test_position_in_use_cannot_be_deleted(db_session: Session) -> None:
    member = Member(name="김민수")
    team = Team(name="A")
    guitar = db_session.scalars(select(Position).where(Position.name == "기타")).one()
    db_session.add_all([member, team])
    db_session.flush()
    db_session.add(
        Membership(member_id=member.id, team_id=team.id, position_id=guitar.id)
    )
    db_session.commit()

    with pytest.raises(IntegrityError):
        db_session.execute(delete(Position).where(Position.id == guitar.id))
        db_session.commit()


def test_period_requires_both_run_times(db_session: Session) -> None:
    db_session.add(
        Period(
            kind="focused",
            starts_on=date(2026, 8, 1),
            ends_on=date(2026, 8, 14),
            everyday=False,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
