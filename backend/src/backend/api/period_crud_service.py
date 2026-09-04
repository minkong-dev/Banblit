from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.period_crud_input import (
    parse_calendar_date,
    parse_clock,
    require_ends_not_before_starts,
    require_valid_kind,
)
from backend.db.models import Period


def list_periods(session: Session) -> list[Period]:
    return list(
        session.scalars(select(Period).order_by(Period.starts_on, Period.id)).all()
    )


def create_period(
    session: Session,
    kind: str,
    starts_on: str,
    ends_on: str,
    everyday: bool,
    first_run_at: str,
    second_run_at: str,
) -> Period:
    """새 기간을 만든다. 경계에서 kind·날짜 순서를 사람이 읽을 문장으로 거절한다."""
    require_valid_kind(kind)
    starts = parse_calendar_date(starts_on, "시작일")
    ends = parse_calendar_date(ends_on, "종료일")
    require_ends_not_before_starts(starts, ends)

    period = Period(
        kind=kind,
        starts_on=starts,
        ends_on=ends,
        everyday=everyday,
        first_run_at=parse_clock(first_run_at, "1차 연산 시각"),
        second_run_at=parse_clock(second_run_at, "2차 연산 시각"),
    )
    session.add(period)
    session.commit()
    return period


def _validated_changes(
    period: Period,
    kind: str | None,
    starts_on: str | None,
    ends_on: str | None,
    first_run_at: str | None,
    second_run_at: str | None,
) -> dict[str, object]:
    """보낸 항목을 검증해 고칠 값만 담아 돌려준다. 안 보낸 항목은 담기지 않는다."""
    changes: dict[str, object] = {}
    if kind is not None:
        require_valid_kind(kind)
        changes["kind"] = kind

    starts = (
        parse_calendar_date(starts_on, "시작일") if starts_on is not None else period.starts_on
    )
    ends = parse_calendar_date(ends_on, "종료일") if ends_on is not None else period.ends_on
    require_ends_not_before_starts(starts, ends)
    changes["starts_on"] = starts
    changes["ends_on"] = ends

    if first_run_at is not None:
        changes["first_run_at"] = parse_clock(first_run_at, "1차 연산 시각")
    if second_run_at is not None:
        changes["second_run_at"] = parse_clock(second_run_at, "2차 연산 시각")
    return changes


def update_period(
    session: Session,
    period_id: int,
    kind: str | None,
    starts_on: str | None,
    ends_on: str | None,
    everyday: bool | None,
    first_run_at: str | None,
    second_run_at: str | None,
) -> Period:
    """period_id 의 기간에서 보낸 항목만 고쳐 저장하고, 고쳐진 기간을 돌려준다."""
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("그런 기간이 없습니다")

    # _validated_changes 를 먼저 통과시킨 뒤에만 대입한다. 대입이 앞서면 검증이
    # 실패해도 세션에 dirty 로 남아, 조회 한 줄만 끼어도 커밋 안 한 값이 저장된다.
    changes = _validated_changes(
        period, kind, starts_on, ends_on, first_run_at, second_run_at
    )
    if everyday is not None:
        changes["everyday"] = everyday
    for field, value in changes.items():
        setattr(period, field, value)

    session.commit()
    return period
