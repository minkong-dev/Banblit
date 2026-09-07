from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.unavailable_input import (
    require_repeat_until_only_when_weekly,
    require_valid_slot_bounds,
)
from backend.db.models import Member, UnavailableTime


def _require_self(member_id: int, requester: Member) -> None:
    """member_id 가 requester 본인의 번호인지 확인하고, 아니면 PermissionError 를 던진다.

    남의 번호든 없는 번호든 똑같이 막는다. 역할은 보지 않는다 — 불가능 시간은
    본인만 관리하고 헤드매니저도 예외가 아니다(.cluedoc/accounts-and-roles 역할 표).
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
    repeats_weekly: bool,
    repeat_until: date | None,
) -> UnavailableTime:
    """못 나오는 시간 하나를 만든다. 경계에서 주인·시간대·격자·반복 조합을 거절한다."""
    _require_self(member_id, requester)
    require_valid_slot_bounds(starts_at, ends_at)
    require_repeat_until_only_when_weekly(repeats_weekly, repeat_until)

    row = UnavailableTime(
        member_id=member_id,
        starts_at=starts_at,
        ends_at=ends_at,
        repeats_weekly=repeats_weekly,
        repeat_until=repeat_until,
    )
    session.add(row)
    session.commit()
    return row


def delete_unavailable(
    session: Session, member_id: int, requester: Member, time_id: int
) -> None:
    """member_id 본인의 못 나오는 시간만 지운다. 남의 것을 지정하면 없는 것과 같게 거절한다."""
    _require_self(member_id, requester)
    row = session.get(UnavailableTime, time_id)
    if row is None or row.member_id != member_id:
        raise ValueError("그런 일정이 없습니다")
    session.delete(row)
    session.commit()
