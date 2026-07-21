from datetime import date, datetime, time

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Assignment, Period, Room, Team


def _focused_period() -> Period:
    return Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 14),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )


def test_focused_period_with_two_run_times_round_trips(db_session: Session) -> None:
    period = _focused_period()
    db_session.add(period)
    db_session.commit()
    assert period.first_run_at == time(9, 0)
    assert period.second_run_at == time(21, 0)


def test_unknown_period_kind_is_rejected(db_session: Session) -> None:
    db_session.add(
        Period(kind="party", starts_on=date(2026, 8, 1), ends_on=date(2026, 8, 2))
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_room_and_start_cannot_be_assigned_twice(db_session: Session) -> None:
    period = _focused_period()
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(22, 0))
    team_a, team_b = Team(name="A"), Team(name="B")
    db_session.add_all([period, room, team_a, team_b])
    db_session.flush()

    slot_start = datetime(2026, 8, 1, 19, 0)
    slot_end = datetime(2026, 8, 1, 19, 30)
    db_session.add(
        Assignment(
            period_id=period.id, team_id=team_a.id, room_id=room.id,
            starts_at=slot_start, ends_at=slot_end,
        )
    )
    db_session.flush()
    db_session.add(
        Assignment(
            period_id=period.id, team_id=team_b.id, room_id=room.id,
            starts_at=slot_start, ends_at=slot_end,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
