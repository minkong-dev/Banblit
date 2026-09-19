from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, Notification, TeamSlot


def notify_assignment_updated(
    session: Session, period_id: int, created_at: datetime
) -> int:
    """해당 기간에 slot(점유 단위 길이의 시간 칸)을 배정받은 팀에 속한 모든 멤버에게 알림을 생성하고, 생성된 개수를 반환합니다.

    저장된 Assignment 행에서 팀 번호를 조회해 대상 멤버를 결정합니다. 계산에 입력한 팀 목록이
    아니라 실제로 slot 을 배정받은 팀을 기준으로 합니다. 한 멤버가 여러 팀에 속한 경우에도 알림은 1개만 생성합니다.
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


def mark_all_read(session: Session, member_id: int) -> None:
    """해당 멤버의 알림을 전부 삭제합니다. 다른 멤버의 알림은 삭제하지 않습니다.

    읽음 표시만 남기고 행을 보존하면 삭제되는 경로가 없어 행이 쌓이기만 합니다. 알림은 배정 1회마다
    배정받은 팀의 멤버 전원에게 1행씩 생성되고, 조회는 상한 없이 전 행을 반환하며 화면은 20초마다
    다시 조회합니다(main.tsx 의 LIVE_REFETCH_MS). 읽은 알림을 다시 볼 경로는 없으므로 삭제합니다.
    """
    session.execute(delete(Notification).where(Notification.member_id == member_id))
    session.commit()
