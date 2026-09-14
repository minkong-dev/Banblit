from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.db.models import Assignment, Notification, TeamSlot


def notify_assignment_updated(
    session: Session, period_id: int, created_at: datetime
) -> int:
    """해당 기간에 slot(1시간 단위 시간 칸)을 배정받은 팀에 속한 모든 멤버에게 알림을 생성하고, 생성된 개수를 반환합니다.

    저장된 배정 기록에서 팀 번호를 추출하여 명단을 작성합니다 — 계산에 입력한 팀 목록이
    아니라 실제로 slot을 배정받은 팀을 기준으로 합니다. 한 멤버가 여러 팀에 속한 경우에도 한 줄만 생성됩니다.
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
    """해당 멤버에게 온 알림을 최신순으로 반환합니다. 다른 멤버의 알림은 조회되지 않습니다."""
    return list(
        session.scalars(
            select(Notification)
            .where(Notification.member_id == member_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        ).all()
    )


def mark_all_read(session: Session, member_id: int, read_at: datetime) -> None:
    """해당 멤버의 미읽 알림에 읽은 시간을 설정합니다. 이미 읽은 알림은 변경하지 않습니다."""
    session.execute(
        update(Notification)
        .where(Notification.member_id == member_id)
        .where(Notification.read_at.is_(None))
        .values(read_at=read_at)
    )
    session.commit()
