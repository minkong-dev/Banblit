from datetime import date, datetime, time

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.period_service import assign_period
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

SAVED_AT = datetime(2026, 8, 1, 9, 0)


def _position(session: Session) -> int:
    return session.scalars(select(Position.id)).first()


def _period(session: Session, kind: str = "focused") -> int:
    period = Period(
        kind=kind,
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 1),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    session.add(period)
    session.flush()
    return period.id


def _team_with_member(session: Session, team_name: str, member_name: str) -> int:
    team = Team(name=team_name)
    member = Member(name=member_name)
    session.add_all([team, member])
    session.flush()
    session.add(
        Membership(
            member_id=member.id, team_id=team.id, position_id=_position(session)
        )
    )
    session.flush()
    return team.id


def _room(session: Session, name: str, opens: time, closes: time) -> int:
    room = Room(name=name, opens_at=opens, closes_at=closes)
    session.add(room)
    session.flush()
    return room.id


def test_successful_assignment_is_saved_as_the_current_schedule(
    db_session: Session,
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))  # 2칸

    result = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is True
    assert result.saved is True
    saved = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert len(saved) == 2  # 팀 하나가 전체 2칸을 가져간다
    assert {row.room_id for row in saved} == {room_id}
    assert {row.team_id for row in saved} == {team_id}


def test_failed_assignment_saves_nothing_and_names_who_to_exclude(
    db_session: Session,
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    blocked_member = db_session.scalars(select(Member).where(Member.name == "김민수")).one()
    # 두 번째 멤버를 넣고 그 사람만 운영시간 내내 불가능하게 만든다.
    other = Member(name="이영희")
    db_session.add(other)
    db_session.flush()
    db_session.add(
        Membership(
            member_id=other.id, team_id=team_id, position_id=_position(db_session)
        )
    )
    db_session.add(
        UnavailableTime(
            member_id=other.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            repeats_weekly=False,
            repeat_until=None,
        )
    )
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    result = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is False
    assert result.saved is False
    assert db_session.scalars(select(Assignment)).all() == []
    excluded = [
        result.member_by_key[p.excluded_member][1]
        for p in result.resolution.proposals
    ]
    assert excluded == ["이영희"]
    assert blocked_member.name == "김민수"


def test_open_period_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session, kind="open")
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    with pytest.raises(ValueError, match="집중"):
        assign_period(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)


def test_unknown_team_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    with pytest.raises(ValueError, match="팀"):
        assign_period(db_session, period_id, [999999], [room_id], saved_at=SAVED_AT)


def test_unknown_room_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")

    with pytest.raises(ValueError, match="합주실"):
        assign_period(db_session, period_id, [team_id], [999999], saved_at=SAVED_AT)


def test_reassignment_archives_the_previous_schedule(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    assign_period(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)
    assign_period(
        db_session,
        period_id,
        [team_id],
        [room_id],
        saved_at=datetime(2026, 8, 1, 21, 0),
    )

    from backend.db.models import AssignmentBackup

    backups = db_session.scalars(select(AssignmentBackup)).all()
    assert len(backups) == 2  # 첫 회차의 2칸이 백업으로 옮겨졌다
    assert {b.saved_at for b in backups} == {datetime(2026, 8, 1, 21, 0)}
