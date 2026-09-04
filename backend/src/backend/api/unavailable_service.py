from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.unavailable_input import (
    require_repeat_until_only_when_weekly,
    require_valid_slot_bounds,
)
from backend.db.models import Member, UnavailableTime


def _get_member_or_raise(session: Session, member_id: int) -> Member:
    member = session.get(Member, member_id)
    if member is None:
        raise ValueError("그런 사람이 없습니다")
    return member


def list_unavailable(session: Session, member_id: int) -> list[UnavailableTime]:
    _get_member_or_raise(session, member_id)
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
    starts_at: datetime,
    ends_at: datetime,
    repeats_weekly: bool,
    repeat_until: date | None,
) -> UnavailableTime:
    """못 나오는 시간 하나를 만든다. 경계에서 시간대·격자·반복 조합을 거절한다."""
    # 로그인이 붙으면 여기서 토큰의 주인이 이 member_id 본인인지 확인한다. 지금은
    # 요청한 사람이 누구인지 서버가 모르므로 이 규칙을 걸 수 없다.
    require_valid_slot_bounds(starts_at, ends_at)
    require_repeat_until_only_when_weekly(repeats_weekly, repeat_until)
    _get_member_or_raise(session, member_id)

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


def delete_unavailable(session: Session, member_id: int, time_id: int) -> None:
    """member_id 본인의 못 나오는 시간만 지운다. 남의 것을 지정하면 없는 것과 같게 거절한다."""
    # 로그인이 붙으면 여기서 토큰의 주인이 이 member_id 본인인지 확인한다.
    row = session.get(UnavailableTime, time_id)
    if row is None or row.member_id != member_id:
        raise ValueError("그런 일정이 없습니다")
    session.delete(row)
    session.commit()
