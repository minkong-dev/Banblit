from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup

BACKUP_KEEP = 2  # 남길 백업 회차 수. 하루 2회 연산 = 하루치.


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
    _prune_backups(session, period_id)


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


def _prune_backups(session: Session, period_id: int) -> None:
    saved_times = session.scalars(
        select(AssignmentBackup.saved_at)
        .where(AssignmentBackup.period_id == period_id)
        .distinct()
        .order_by(AssignmentBackup.saved_at.desc())
    ).all()
    keep = saved_times[:BACKUP_KEEP]
    if not keep:
        # keep이 비면 notin_([])이 항상 참이 되어 그 기간의 백업이 통째로 지워진다 — 방어.
        return
    session.execute(
        delete(AssignmentBackup)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at.notin_(keep))
    )


def rollback_schedule(session: Session, period_id: int) -> bool:
    """가장 최근 백업 회차를 현행으로 되돌리고 그 회차를 지운다.

    되돌릴 백업이 없으면 아무것도 바꾸지 않고 False를 돌려준다. 커밋은 호출자가 한다.
    """
    latest = session.scalar(
        select(AssignmentBackup.saved_at)
        .where(AssignmentBackup.period_id == period_id)
        .order_by(AssignmentBackup.saved_at.desc())
        .limit(1)
    )
    if latest is None:
        return False

    session.execute(delete(Assignment).where(Assignment.period_id == period_id))
    batch = session.scalars(
        select(AssignmentBackup)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at == latest)
    ).all()
    for b in batch:
        session.add(
            Assignment(
                period_id=b.period_id,
                team_id=b.team_id,
                room_id=b.room_id,
                starts_at=b.starts_at,
                ends_at=b.ends_at,
            )
        )
    session.execute(
        delete(AssignmentBackup)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at == latest)
    )
    return True
