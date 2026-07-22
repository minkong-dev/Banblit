from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup, Period, Room, Team
from backend.db.schedule_store import rollback_schedule, save_schedule


def _scaffold(session: Session) -> tuple[int, int, int]:
    """FK를 만족시킬 기간·팀·합주실을 하나씩 만들고 그 id를 돌려준다."""
    period = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 14),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(22, 0))
    session.add_all([period, team, room])
    session.flush()
    return period.id, team.id, room.id


def _row(team_id: int, room_id: int, hour: int) -> dict:
    """8월 1일 hour시 시작하는 30분짜리 배정 한 칸(현행/백업 공용 입력)."""
    return {
        "team_id": team_id,
        "room_id": room_id,
        "starts_at": datetime(2026, 8, 1, hour, 0),
        "ends_at": datetime(2026, 8, 1, hour, 30),
    }


def test_assignment_backup_round_trips(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    db_session.add(
        AssignmentBackup(
            period_id=period_id,
            team_id=team_id,
            room_id=room_id,
            starts_at=datetime(2026, 8, 1, 19, 0),
            ends_at=datetime(2026, 8, 1, 19, 30),
            saved_at=datetime(2026, 8, 1, 21, 0),
        )
    )
    db_session.commit()

    saved = db_session.scalars(select(AssignmentBackup)).one()
    assert saved.saved_at == datetime(2026, 8, 1, 21, 0)
    assert saved.starts_at == datetime(2026, 8, 1, 19, 0)


def test_first_save_writes_current_schedule(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)

    save_schedule(
        db_session,
        period_id,
        [_row(team_id, room_id, 19)],
        saved_at=datetime(2026, 8, 1, 21, 0),
    )
    db_session.commit()

    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 19, 0)]
    assert db_session.scalars(select(AssignmentBackup)).all() == []


def test_second_save_archives_previous(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)

    save_schedule(
        db_session, period_id, [_row(team_id, room_id, 19)],
        saved_at=datetime(2026, 8, 1, 9, 0),
    )
    db_session.commit()
    save_schedule(
        db_session, period_id, [_row(team_id, room_id, 20)],
        saved_at=datetime(2026, 8, 1, 21, 0),
    )
    db_session.commit()

    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 20, 0)]

    backups = db_session.scalars(select(AssignmentBackup)).all()
    assert [b.starts_at for b in backups] == [datetime(2026, 8, 1, 19, 0)]
    assert backups[0].saved_at == datetime(2026, 8, 1, 21, 0)


def test_backups_keep_only_two_most_recent(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)

    # 네 번 저장하면 백업 회차 3개(9:00·21:00·다음날 9:00)가 생기고,
    # 최신 2개만 남아야 한다.
    save_schedule(db_session, period_id, [_row(team_id, room_id, 18)],
                  saved_at=datetime(2026, 8, 1, 8, 0))
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 19)],
                  saved_at=datetime(2026, 8, 1, 9, 0))
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 20)],
                  saved_at=datetime(2026, 8, 1, 21, 0))
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 21)],
                  saved_at=datetime(2026, 8, 2, 9, 0))
    db_session.commit()

    saved_times = set(
        db_session.scalars(select(AssignmentBackup.saved_at).distinct()).all()
    )
    assert saved_times == {
        datetime(2026, 8, 1, 21, 0),
        datetime(2026, 8, 2, 9, 0),
    }


def test_rollback_restores_previous_schedule(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    save_schedule(db_session, period_id, [_row(team_id, room_id, 19)],
                  saved_at=datetime(2026, 8, 1, 9, 0))
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 20)],
                  saved_at=datetime(2026, 8, 1, 21, 0))
    db_session.commit()

    ok = rollback_schedule(db_session, period_id)
    db_session.commit()

    assert ok is True
    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 19, 0)]
    assert db_session.scalars(select(AssignmentBackup)).all() == []


def test_rollback_without_backup_returns_false(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    save_schedule(db_session, period_id, [_row(team_id, room_id, 19)],
                  saved_at=datetime(2026, 8, 1, 9, 0))
    db_session.commit()

    ok = rollback_schedule(db_session, period_id)
    db_session.commit()

    assert ok is False
    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 19, 0)]
