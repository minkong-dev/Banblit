from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.notification.pipeline import notify_rejected
from backend.services.period.pipeline import require_unavailable_open
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
    등록, 수정, 삭제는 본인만 할 수 있으며 헤드매니저도 예외가 아닙니다. 조회는 _require_read 가 따로 검사합니다.
    """
    if member_id != requester.id:
        raise PermissionError("본인의 불가능 일정만 관리할 수 있어요")


def _require_read(session: Session, member_id: int, requester: Member) -> None:
    """본인이거나 unavailable_read 권한이 있으면 통과하고, 아니면 PermissionError 를 발생시킵니다."""
    if member_id == requester.id:
        return
    if "unavailable_read" not in account_permissions(session, requester.id):
        raise PermissionError("다른 멤버의 불가능 일정을 조회할 권한이 없어요")


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
    """등록된 불가능 일정 전부를 (행, 멤버 이름) 으로 시작 시간 순으로 반환합니다.

    권한은 호출하는 endpoint 가 검증합니다.
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
    now: datetime,
) -> UnavailableTime:
    """불가능 일정 하나를 생성합니다. 본인 여부, 시작 시간과 종료 시간의 순서, slot(점유 단위 길이의 시간 칸) 격자, 반복 조건,
    now 기준으로 마감된 집중 합주기간에 걸리지 않는지를 검증합니다."""
    _require_self(member_id, requester)
    require_valid_slot_bounds(starts_at, ends_at, slot_minutes(session))
    require_repeat_weekdays(repeat_weekdays)
    require_repeat_end(repeat_weekdays, repeat_count, repeat_until)

    row = UnavailableTime(
        member_id=member_id,
        starts_at=starts_at,
        ends_at=ends_at,
        # x or None 은 x 가 거짓(0, None)이면 None 입니다. 요일 bitmask 0 을 "반복 없음" 인 None 으로 저장합니다.
        repeat_weekdays=repeat_weekdays or None,
        repeat_count=repeat_count,
        repeat_until=repeat_until,
        # 공백만 입력한 것은 미입력과 같게 처리합니다. 화면에 빈 줄을 표시하지 않기 위함입니다.
        # (r or "").strip() or None 은 None 과 빈 문자열, 공백만 있는 문자열을 전부 None 으로 저장합니다.
        reason=(reason or "").strip() or None,
        name=(name or "").strip() or None,
    )
    require_unavailable_open(session, [row], now)
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
    now: datetime,
) -> UnavailableTime:
    """member_id 본인의 불가능 일정 하나를 수정합니다. 검증 항목은 생성과 같습니다.

    다른 사용자의 불가능 일정을 지정하면 삭제와 같게 없는 일정으로 처리합니다.
    """
    _require_self(member_id, requester)
    row = session.get(UnavailableTime, time_id)
    if row is None or row.member_id != member_id:
        raise ValueError("존재하지 않는 일정이에요")
    require_valid_slot_bounds(starts_at, ends_at, slot_minutes(session))
    require_repeat_weekdays(repeat_weekdays)
    require_repeat_end(repeat_weekdays, repeat_count, repeat_until)
    # 저장된 값과 새 값을 함께 검증합니다. 저장된 값이 마감된 기간에 걸리면 기간 밖으로 옮기는 수정도 막습니다.
    changed = UnavailableTime(
        member_id=member_id,
        starts_at=starts_at,
        ends_at=ends_at,
        repeat_weekdays=repeat_weekdays or None,
        repeat_count=repeat_count,
        repeat_until=repeat_until,
    )
    require_unavailable_open(session, [row, changed], now)

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
        raise PermissionError("다른 멤버의 불가능 일정을 반려할 권한이 없어요")
    trimmed = require_reject_reason(reason)
    # with_for_update=True 는 SELECT ... FOR UPDATE 로 time_id 의 행 1개를 transaction 이 끝날 때까지 잠급니다.
    # 같은 일정을 두 사람이 동시에 반려하면 알림이 2개 가거나 두 번째 삭제가 500 이 됩니다.
    row = session.get(UnavailableTime, time_id, with_for_update=True)
    if row is None or row.member_id != member_id:
        raise ValueError("존재하지 않는 일정이에요")
    require_unavailable_open(session, [row], rejected_at)
    if row.member_id != requester.id:
        notify_rejected(session, row.member_id, "unavailable", row.starts_at, trimmed, rejected_at)
    session.delete(row)
    session.commit()


def delete_unavailable(
    session: Session, member_id: int, requester: Member, time_id: int, now: datetime
) -> None:
    """member_id 본인의 불가능 일정만 삭제합니다. 다른 사용자의 불가능 일정을 지정하면 존재하지 않는 불가능 일정으로 처리합니다.

    now 기준으로 마감된 집중 합주기간에 걸리는 일정이면 ValueError 입니다.
    """
    _require_self(member_id, requester)
    row = session.get(UnavailableTime, time_id)
    if row is None or row.member_id != member_id:
        raise ValueError("존재하지 않는 일정이에요")
    require_unavailable_open(session, [row], now)
    session.delete(row)
    session.commit()
