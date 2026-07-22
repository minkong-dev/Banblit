from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import AssignmentBackup, Period, Room, Team


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
