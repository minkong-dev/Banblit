from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.input import (
    require_one_repeat_cycle,
    require_repeat_until_only_when_repeating,
    require_valid_slot_bounds,
)
from backend.db.models import Member, UnavailableTime


def _require_self(member_id: int, requester: Member) -> None:
    """member_id 가 requester 본인의 번호인지 검증하고, 아니면 PermissionError 를 발생시킵니다.

    남의 번호든 없는 번호든 똑같이 거부합니다. 역할을 확인하지 않습니다. 불가능 시간은
    본인만 관리하며 헤드매니저도 예외가 아닙니다(.cluedoc/accounts-and-roles 역할 표).
    """
    if member_id != requester.id:
        raise PermissionError("본인의 불가능 시간만 관리할 수 있습니다")


def list_unavailable(
    session: Session, member_id: int, requester: Member
) -> list[UnavailableTime]:
    _require_self(member_id, requester)
    return list(
        session.scalars(
            select(UnavailableTime)
            .where(UnavailableTime.member_id == member_id)
            .order_by(UnavailableTime.starts_at)
        ).all()
    )


def create_unavailable(
    session: Session,
    member_id: int,
    requester: Member,
    starts_at: datetime,
    ends_at: datetime,
    repeats_daily: bool,
    repeats_weekly: bool,
    repeat_until: date | None,
    reason: str | None,
) -> UnavailableTime:
    """불가능 시간 하나를 생성합니다. 경계에서 멤버·시간대·slot(1시간 단위 시간 칸)·반복 조합을 검증합니다."""
    _require_self(member_id, requester)
    require_valid_slot_bounds(starts_at, ends_at)
    require_one_repeat_cycle(repeats_daily, repeats_weekly)
    require_repeat_until_only_when_repeating(repeats_daily, repeats_weekly, repeat_until)

    row = UnavailableTime(
        member_id=member_id,
        starts_at=starts_at,
        ends_at=ends_at,
        repeats_daily=repeats_daily,
        repeats_weekly=repeats_weekly,
        repeat_until=repeat_until,
        # 공백만 입력한 것은 미입력과 같게 처리합니다. 화면에 빈 줄을 표시하지 않기 위함입니다.
        reason=(reason or "").strip() or None,
    )
    session.add(row)
    session.commit()
    return row


def delete_unavailable(
    session: Session, member_id: int, requester: Member, time_id: int
) -> None:
    """member_id 본인의 불가능 시간만 삭제합니다. 다른 사용자의 불가능 시간을 지정하면 없는 시간으로 취급합니다."""
    _require_self(member_id, requester)
    row = session.get(UnavailableTime, time_id)
    if row is None or row.member_id != member_id:
        raise ValueError("그런 일정이 없습니다")
    session.delete(row)
    session.commit()
