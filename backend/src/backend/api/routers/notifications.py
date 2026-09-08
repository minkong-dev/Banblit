from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.api.input import format_created_at
from backend.api.notification_service import list_notifications, mark_all_read
from backend.api.schemas import NotificationOut, NotificationsOut
from backend.db.models import Member, Notification
from backend.db.pipeline import get_session

router = APIRouter()


def _notification_out(notification: Notification) -> NotificationOut:
    return NotificationOut(
        id=notification.id,
        kind=notification.kind,
        created_at=format_created_at(notification.created_at),
        read=notification.read_at is not None,
    )


# 알림은 언제나 "내 것"이다 — 어느 사람의 것인지는 주소가 아니라 인증 쿠키가 정한다.
# 주소로 받으면 남의 번호를 적어 보는 endpoint 가 되고, 남의 번호를 막는 확인이 또 필요해진다.
@router.get("/notifications", response_model=NotificationsOut)
def read_notifications(
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> NotificationsOut:
    rows = list_notifications(session, requester.id)
    return NotificationsOut(notifications=[_notification_out(row) for row in rows])


@router.post("/notifications/read", status_code=204)
def mark_notifications_read(
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    mark_all_read(session, requester.id, datetime.now())
