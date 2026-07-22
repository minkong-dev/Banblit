from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup


def save_schedule(
    session: Session,
    period_id: int,
    rows: list[dict],
    saved_at: datetime,
) -> None:
    """그 기간의 현행 배정을 새 배정으로 교체한다.

    교체 전, 기존 현행은 saved_at 도장을 찍어 백업으로 옮긴다.
    rows: 각 {"team_id", "room_id", "starts_at", "ends_at"}. 커밋은 호출자가 한다.
    """
    _archive_current(session, period_id, saved_at)
    session.execute(delete(Assignment).where(Assignment.period_id == period_id))
    for row in rows:
        session.add(Assignment(period_id=period_id, **row))


def _archive_current(session: Session, period_id: int, saved_at: datetime) -> None:
    current = session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    for a in current:
        session.add(
            AssignmentBackup(
                period_id=a.period_id,
                team_id=a.team_id,
                room_id=a.room_id,
                starts_at=a.starts_at,
                ends_at=a.ends_at,
                saved_at=saved_at,
            )
        )
