from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.db.models import Assignment, Notification, TeamSlot


def notify_assignment_updated(
    session: Session, period_id: int, created_at: datetime
) -> int:
    """그 기간에 slot 을 받은 팀들의 소속 사람 전부에게 알림을 남기고, 남긴 수를 돌려준다.

    저장된 배정(assignments)에서 팀 번호를 되찾아 명단을 편다 — 계산에 넘긴 팀 목록이
    아니라 실제로 slot 을 받은 팀이 기준이다. 한 사람이 여러 팀에 있어도 한 줄만 남는다.
    """
    member_ids = session.scalars(
        select(TeamSlot.member_id)
        .join(Assignment, Assignment.team_id == TeamSlot.team_id)
        .where(Assignment.period_id == period_id)
        .where(TeamSlot.member_id.is_not(None))
        .distinct()
        .order_by(TeamSlot.member_id)
    ).all()
    if not member_ids:
        return 0

    session.add_all(
        Notification(
            member_id=member_id, kind="assignment_updated", created_at=created_at
        )
        for member_id in member_ids
    )
    session.commit()
    return len(member_ids)


def list_notifications(session: Session, member_id: int) -> list[Notification]:
    """그 사람 앞으로 온 알림을 최신순으로 돌려준다. 남의 것은 이 조회에 걸리지 않는다."""
    return list(
        session.scalars(
            select(Notification)
            .where(Notification.member_id == member_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        ).all()
    )


def mark_all_read(session: Session, member_id: int, read_at: datetime) -> None:
    """그 사람의 안 읽은 알림에 읽은 시각을 채운다. 이미 읽은 줄은 그대로 둔다."""
    session.execute(
        update(Notification)
        .where(Notification.member_id == member_id)
        .where(Notification.read_at.is_(None))
        .values(read_at=read_at)
    )
    session.commit()
