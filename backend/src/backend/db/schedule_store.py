from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.orm import Session

from backend.db.models import Assignment


def save_schedule(
    session: Session,
    period_id: int,
    rows: list[dict],
    saved_at: datetime,
) -> None:
    """그 기간의 현행 배정을 새 배정으로 교체한다.

    rows: 각 {"team_id", "room_id", "starts_at", "ends_at"}.
    커밋은 호출자가 한다.
    """
    session.execute(delete(Assignment).where(Assignment.period_id == period_id))
    for row in rows:
        session.add(Assignment(period_id=period_id, **row))
