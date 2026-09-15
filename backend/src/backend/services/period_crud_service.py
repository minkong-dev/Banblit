from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.input import (
    parse_calendar_date,
    parse_clock,
    require_ends_not_before_starts,
    require_valid_kind,
)
from backend.db.models import Period
from backend.db.pipeline import commit_translating

# 위반될 수 있는 제약과 그때 표시할 문장입니다. 제약 이름은 migration b5e1d9a37c42 가 정했습니다.
PERIOD_MESSAGES = {
    "periods_focused_no_overlap": (
        "다른 집중 합주기간과 날짜가 겹칩니다. \"매일\" 기간은 종료일 없이 계속되는 것으로 봅니다"
    ),
}


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
    """새 기간을 생성합니다. 경계에서 kind와 날짜 순서를 사람이 읽을 문장으로 검증합니다."""
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
    commit_translating(session, PERIOD_MESSAGES)
    return period


def _validated_changes(
    period: Period,
    kind: str | None,
    starts_on: str | None,
    ends_on: str | None,
    first_run_at: str | None,
    second_run_at: str | None,
) -> dict[str, object]:
    """전달된 항목을 검증하여 수정할 값만 담아 반환합니다. 전달되지 않은 항목은 포함하지 않습니다."""
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
    """period_id의 기간에서 전달된 항목만 수정하여 저장하고, 수정된 기간을 반환합니다."""
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("그런 기간이 없습니다")

    # _validated_changes 를 먼저 통과시킨 뒤에만 대입합니다. 대입이 앞서면 검증이 실패해도
    # session 에 dirty 상태로 남아, 같은 session 에서 조회가 한 번이라도 실행되면 autoflush 로
    # 검증에 실패한 값이 데이터베이스에 기록됩니다.
    changes = _validated_changes(
        period, kind, starts_on, ends_on, first_run_at, second_run_at
    )
    if everyday is not None:
        changes["everyday"] = everyday
    for field, value in changes.items():
        setattr(period, field, value)

    commit_translating(session, PERIOD_MESSAGES)
    return period


def delete_period(session: Session, period_id: int) -> None:
    """period_id 의 기간을 삭제합니다. 없는 기간이면 ValueError 를 발생시킵니다.

    그 기간의 배정 결과(assignments)·계산 기록(assignment_runs)·이전 배정기록(assignment_backups)은
    외래 키 ondelete=CASCADE 로 DB 가 함께 삭제합니다. 예약은 기간과 연결되어 있지 않아 남습니다.
    """
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("그런 기간이 없습니다")
    session.delete(period)
    session.commit()
