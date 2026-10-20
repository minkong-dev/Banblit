from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Period, UnavailableTime
from backend.services.notification.pipeline import notify_everyone
from backend.services.period.period_input import DAY, MAX_REPEAT_SPAN, expand_unavailable
from backend.services.validation.pipeline import require_non_empty


def require_naive_close(closes_at: datetime | None) -> None:
    """closes_at 에 시간대가 붙어 있으면 ValueError 를 발생시킵니다. 배정 엔진과 같이 시간대 없는 시각만 받습니다."""
    if closes_at is not None and closes_at.tzinfo is not None:
        raise ValueError("마감 일시에는 시간대를 붙이지 않아요")


def is_closed(period: Period, now: datetime) -> bool:
    """period 의 마감 일시가 now 이전이면 True 를 반환합니다. 마감 일시가 없으면 False 입니다."""
    return period.closes_at is not None and period.closes_at <= now


def require_not_fixed(period: Period) -> None:
    """확정된 기간이면 ValueError 를 발생시킵니다. 기록 적용 전에 호출합니다."""
    if period.fixed_at is not None:
        raise ValueError("확정된 기간은 배정기록을 적용할 수 없어요. 확정을 해제한 뒤 적용해주세요")


def require_not_closed(period: Period, now: datetime) -> None:
    """마감 일시가 지난 기간이면 ValueError 를 발생시킵니다. 수동 계산 접수 전에 호출합니다."""
    if is_closed(period, now):
        raise ValueError("마감된 기간은 계산할 수 없어요. 확정을 해제한 뒤 계산해주세요")


def periods_to_fix(session: Session, now: datetime) -> list[Period]:
    """마감 일시가 now 이전이고 아직 확정되지 않은 집중 합주기간을 번호 순서로 반환합니다."""
    return list(
        session.scalars(
            select(Period)
            .where(Period.kind == "focused")
            .where(Period.closes_at <= now)
            .where(Period.fixed_at.is_(None))
            .order_by(Period.id)
        ).all()
    )


def require_unavailable_open(session: Session, rows: list[UnavailableTime], now: datetime) -> None:
    """rows 의 불가능 일정(반복 포함) 중 하나라도 마감된 집중 합주기간의 날짜에 걸리면 ValueError 를 발생시킵니다.

    rows 는 저장 전의 새 값과 저장된 옛 값을 함께 받습니다. 옛 값이 마감된 기간에 걸리면 기간 밖으로 옮기는 수정도 막습니다.
    """
    closed = session.scalars(
        select(Period).where(Period.kind == "focused").where(Period.closes_at <= now)
    ).all()
    for period in closed:
        start = datetime.combine(period.starts_on, time())
        # "매일" 기간은 종료일이 없어 반복 전개 상한까지를 기간으로 봅니다.
        end = start + MAX_REPEAT_SPAN if period.everyday else datetime.combine(period.ends_on, time()) + DAY
        if expand_unavailable(rows, start, end):
            name = period.name or "집중 합주기간"
            raise ValueError(f"{name}이 마감되어 그 기간의 불가능 일정은 추가, 수정, 삭제할 수 없어요")


def unfix_period(session: Session, period: Period, reason: str, now: datetime) -> Period:
    """확정된 period 의 확정과 마감 일시를 비우고, 전체 멤버에게 reason 을 담은 확정 해제 알림을 보냅니다.

    마감 일시도 비우는 이유는, 남겨 두면 지난 마감 일시를 보고 자동 배정 job 이 다음 확인 때 다시 확정하기 때문입니다.
    확정되지 않은 기간이거나 사유가 비었으면 ValueError 입니다. 사유 길이 상한은 요청 본문(api/schemas.py 의 UnfixIn)이 검증합니다.
    """
    if period.fixed_at is None:
        raise ValueError("확정되지 않은 기간이에요")
    trimmed = require_non_empty(reason, "해제 사유")
    period.fixed_at = None
    period.closes_at = None
    notify_everyone(session, "assignment_unfixed", now, reason=trimmed)
    session.commit()
    return period

