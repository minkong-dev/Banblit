from datetime import date, datetime, time

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Member, Room, UnavailableTime


def test_weekly_repeating_unavailable_time_round_trips(db_session: Session) -> None:
    member = Member(name="김민수")
    db_session.add(member)
    db_session.flush()
    db_session.add(
        UnavailableTime(
            member_id=member.id,
            starts_at=datetime(2026, 7, 21, 18, 0),
            ends_at=datetime(2026, 7, 21, 20, 0),
            repeats_weekly=True,
            repeat_until=date(2026, 9, 30),
        )
    )
    db_session.commit()
    saved = db_session.scalars(select(UnavailableTime)).one()
    assert saved.repeats_weekly is True
    assert saved.repeat_until == date(2026, 9, 30)


def test_reversed_unavailable_interval_is_rejected(db_session: Session) -> None:
    member = Member(name="김민수")
    db_session.add(member)
    db_session.flush()
    db_session.add(
        UnavailableTime(
            member_id=member.id,
            starts_at=datetime(2026, 7, 21, 20, 0),
            ends_at=datetime(2026, 7, 21, 18, 0),
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_room_name_must_be_unique(db_session: Session) -> None:
    db_session.add_all(
        [
            Room(name="1번방", opens_at=time(18, 0), closes_at=time(22, 0)),
            Room(name="1번방", opens_at=time(10, 0), closes_at=time(12, 0)),
        ]
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_room_hours_off_the_half_hour_grid_are_rejected(db_session: Session) -> None:
    db_session.add(Room(name="1번방", opens_at=time(18, 20), closes_at=time(20, 0)))
    with pytest.raises(IntegrityError):
        db_session.commit()
