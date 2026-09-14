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


# 알림은 항상 요청한 사용자의 알림입니다 — 누구의 알림인지는 URL이 아니라 인증 cookie(브라우저가 저장해 요청마다
# 함께 보내는 값)가 정합니다. URL로 받으면 다른 사람의 ID를 입력해 보는 endpoint(API의 요청 주소 단위)가 되고,
# 그것을 막는 추가 검증이 필요해집니다.
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
