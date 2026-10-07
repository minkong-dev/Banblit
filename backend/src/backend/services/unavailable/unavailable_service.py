from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.notification.pipeline import notify_rejected
from backend.services.validation.pipeline import (
    require_reject_reason,
    require_repeat_end,
    require_repeat_weekdays,
    require_valid_slot_bounds,
)
from backend.services.permission.pipeline import account_permissions
from backend.services.settings.pipeline import slot_minutes
from backend.db.models import Member, UnavailableTime


def _require_self(member_id: int, requester: Member) -> None:
    """member_id 가 requester 본인의 번호인지 검증하고, 아니면 PermissionError 를 발생시킵니다.

    다른 사용자의 번호든 없는 번호든 같게 거부합니다. 권한을 확인하지 않습니다. 불가능 일정의
    등록·수정·삭제는 본인만 할 수 있으며 헤드매니저도 예외가 아닙니다 — 다른 사람이 대신
    등록한 불가능 일정은 본인이 모르는 채로 배정에 반영됩니다. 조회는 _require_read 가 따로 봅니다.
    """
    if member_id != requester.id:
        raise PermissionError("본인의 불가능 일정만 관리할 수 있습니다")


def _require_read(session: Session, member_id: int, requester: Member) -> None:
    """본인이거나 unavailable_read 권한이 있으면 통과하고, 아니면 PermissionError 를 발생시킵니다."""
    if member_id == requester.id:
        return
    if "unavailable_read" not in account_permissions(session, requester.id):
        raise PermissionError("다른 멤버의 불가능 일정을 조회할 권한이 없습니다")


def list_unavailable(
    session: Session, member_id: int, requester: Member
) -> list[UnavailableTime]:
    _require_read(session, member_id, requester)
    return list(
        session.scalars(
            select(UnavailableTime)
            .where(UnavailableTime.member_id == member_id)
            .order_by(UnavailableTime.starts_at)
        ).all()
    )


def list_all_unavailable(session: Session) -> list[tuple[UnavailableTime, str]]:
    """등록된 불가능 일정 전부를 (행, 멤버 이름) 으로 시작시간 순으로 반환합니다.

    권한은 호출하는 endpoint 가 검증합니다. 멤버마다 따로 조회하지 않고 한 번에 가져오는 이유는,
    이 목록을 쓰는 화면이 멤버 전체를 한 표에 표시하기 때문입니다 — 멤버 수만큼 요청이 늘지 않습니다.
    """
    rows = session.execute(
        select(UnavailableTime, Member.name)
        .join(Member, Member.id == UnavailableTime.member_id)
        .order_by(UnavailableTime.starts_at, UnavailableTime.id)
    ).all()
    return [(row[0], row[1]) for row in rows]


def create_unavailable(
    session: Session,
    member_id: int,
    requester: Member,
    starts_at: datetime,
    ends_at: datetime,
    repeat_weekdays: int | None,
    repeat_count: int | None,
    repeat_until: date | None,
    reason: str | None,
    name: str | None,
) -> UnavailableTime:
    """불가능 일정 하나를 생성합니다. 본인 여부, 시작시간과 종료시간의 순서, slot(점유 단위 길이의 시간 칸) 격자, 반복 조건을 검증합니다."""
    _require_self(member_id, requester)
    require_valid_slot_bounds(starts_at, ends_at, slot_minutes(session))
    require_repeat_weekdays(repeat_weekdays)
    require_repeat_end(repeat_weekdays, repeat_count, repeat_until)

    row = UnavailableTime(
        member_id=member_id,
        starts_at=starts_at,
        ends_at=ends_at,
        repeat_weekdays=repeat_weekdays or None,
        repeat_count=repeat_count,
        repeat_until=repeat_until,
        # 공백만 입력한 것은 미입력과 같게 처리합니다. 화면에 빈 줄을 표시하지 않기 위함입니다.
        reason=(reason or "").strip() or None,
        name=(name or "").strip() or None,
    )
    session.add(row)
    session.commit()
    return row


def update_unavailable(
    session: Session,
    member_id: int,
    requester: Member,
    time_id: int,
    starts_at: datetime,
    ends_at: datetime,
    repeat_weekdays: int | None,
    repeat_count: int | None,
    repeat_until: date | None,
    reason: str | None,
    name: str | None,
) -> UnavailableTime:
    """member_id 본인의 불가능 일정 하나를 수정합니다. 검증 항목은 생성과 같습니다.

    다른 사용자의 불가능 일정을 지정하면 삭제와 같게 없는 일정으로 처리합니다.
    """
    _require_self(member_id, requester)
    row = session.get(UnavailableTime, time_id)
    if row is None or row.member_id != member_id:
        raise ValueError("존재하지 않는 일정입니다")
    require_valid_slot_bounds(starts_at, ends_at, slot_minutes(session))
    require_repeat_weekdays(repeat_weekdays)
    require_repeat_end(repeat_weekdays, repeat_count, repeat_until)

    row.starts_at = starts_at
    row.ends_at = ends_at
    row.repeat_weekdays = repeat_weekdays or None
    row.repeat_count = repeat_count
    row.repeat_until = repeat_until
    row.reason = (reason or "").strip() or None
    row.name = (name or "").strip() or None
    session.commit()
    return row


def reject_unavailable(
    session: Session,
    member_id: int,
    requester: Member,
    time_id: int,
    reason: str,
    rejected_at: datetime,
) -> None:
    """unavailable_manage 권한자가 member_id 의 불가능 일정 하나를 삭제하고, 그 멤버에게 reason 을 담은 반려 알림을 보냅니다.

    권한이 없으면 PermissionError, 사유가 비었거나 길거나 member_id 의 일정이 아니면 ValueError 입니다.
    본인의 일정을 반려하면 알림은 만들지 않습니다.
    """
    if "unavailable_manage" not in account_permissions(session, requester.id):
        raise PermissionError("다른 멤버의 불가능 일정을 반려할 권한이 없습니다")
    trimmed = require_reject_reason(reason)
    # 행을 잠급니다. 같은 일정을 두 사람이 동시에 반려하면 알림이 2개 가거나 두 번째 삭제가 500 이 됩니다.
    row = session.get(UnavailableTime, time_id, with_for_update=True)
    if row is None or row.member_id != member_id:
        raise ValueError("존재하지 않는 일정입니다")
    if row.member_id != requester.id:
        notify_rejected(session, row.member_id, "unavailable", row.starts_at, trimmed, rejected_at)
    session.delete(row)
    session.commit()


def delete_unavailable(
    session: Session, member_id: int, requester: Member, time_id: int
) -> None:
    """member_id 본인의 불가능 일정만 삭제합니다. 다른 사용자의 불가능 일정을 지정하면 없는 시간으로 처리합니다."""
    _require_self(member_id, requester)
    row = session.get(UnavailableTime, time_id)
    if row is None or row.member_id != member_id:
        raise ValueError("존재하지 않는 일정입니다")
    session.delete(row)
    session.commit()
