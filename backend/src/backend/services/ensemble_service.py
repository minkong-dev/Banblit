"""집중 합주기간의 전체합주 설정을 저장합니다(patch_note 8번).

전체합주 날짜 범위가 기간 안인지, 집중 합주기간인지는 periods 의 CHECK 가 검사합니다(migration d9a4c6e1f207).
기간 수정(PATCH)도 같은 조건을 어길 수 있어 한 곳에서 거절하기 위해서입니다. 이 파일은 형식·시각 순서·
합주실 운영 시간·점유 단위 격자만 검사합니다.
"""

from collections import defaultdict
from datetime import time

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from backend.db.models import EnsembleDay, Period, Room
from backend.db.pipeline import commit_translating
from backend.services.input import (
    parse_calendar_date,
    parse_clock,
    require_ends_not_before_starts,
)
from backend.services.period_crud_service import PERIOD_MESSAGES
from backend.services.settings_service import slot_minutes

ENSEMBLE_FIELDS = (
    "ensemble_starts_on",
    "ensemble_ends_on",
    "ensemble_room_id",
    "ensemble_starts_at",
    "ensemble_ends_at",
)


def _get_period_or_raise(session: Session, period_id: int) -> Period:
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("그런 기간이 없습니다")
    return period


def _get_room_or_raise(session: Session, room_id: int) -> Room:
    room = session.get(Room, room_id)
    if room is None:
        raise ValueError("그런 합주실이 없습니다")
    return room


def _ensemble_times(
    session: Session, room: Room, starts_at: str, ends_at: str
) -> tuple[time, time]:
    """전체합주 시작·끝 시각을 변환하고, 순서·합주실 운영 시간·점유 단위 격자를 검사합니다."""
    start = parse_clock(starts_at, "전체합주 시작 시각")
    end = parse_clock(ends_at, "전체합주 끝 시각")
    if end <= start:
        raise ValueError("전체합주 끝 시각은 시작 시각보다 늦어야 합니다")
    if start < room.opens_at or end > room.closes_at:
        raise ValueError("전체합주 시각은 합주실 운영 시간 안이어야 합니다")
    # 점유 단위는 60 의 약수라(settings CHECK) 분만 나누어 보면 격자 위인지 알 수 있습니다.
    minutes = slot_minutes(session)
    if start.minute % minutes or end.minute % minutes:
        raise ValueError(f"전체합주 시각은 {minutes}분 단위여야 합니다")
    return start, end


def set_ensemble(
    session: Session,
    period_id: int,
    starts_on: str,
    ends_on: str,
    room_id: int,
    starts_at: str,
    ends_at: str,
) -> Period:
    """기간에 전체합주를 지정하거나 변경합니다. 새 날짜 범위 밖이 된 날짜별 시각은 삭제합니다."""
    period = _get_period_or_raise(session, period_id)
    starts = parse_calendar_date(starts_on, "전체합주 시작일")
    ends = parse_calendar_date(ends_on, "전체합주 종료일")
    require_ends_not_before_starts(starts, ends)
    room = _get_room_or_raise(session, room_id)
    start, end = _ensemble_times(session, room, starts_at, ends_at)

    # 삭제를 대입보다 먼저 실행합니다. 대입이 앞서면 이 execute 의 autoflush 가 CHECK 위반을
    # commit_translating 밖에서 발생시켜 문장으로 변환되지 않습니다. commit 이 실패하면 삭제도 rollback 됩니다.
    session.execute(
        delete(EnsembleDay).where(
            EnsembleDay.period_id == period_id,
            or_(EnsembleDay.day < starts, EnsembleDay.day > ends),
        )
    )
    for field, value in zip(ENSEMBLE_FIELDS, (starts, ends, room_id, start, end), strict=True):
        setattr(period, field, value)
    commit_translating(session, PERIOD_MESSAGES)
    return period


def delete_ensemble(session: Session, period_id: int) -> Period:
    """기간의 전체합주 지정을 해제하고 날짜별 시각도 삭제합니다."""
    period = _get_period_or_raise(session, period_id)
    session.execute(delete(EnsembleDay).where(EnsembleDay.period_id == period_id))
    for field in ENSEMBLE_FIELDS:
        setattr(period, field, None)
    session.commit()
    return period


def set_ensemble_day(
    session: Session, period_id: int, day: str, starts_at: str, ends_at: str
) -> Period:
    """전체합주 날짜 하나의 시각을 기본 시각과 다르게 지정합니다. 이미 지정한 날짜면 덮어씁니다."""
    period = _get_period_or_raise(session, period_id)
    first, last, room_id = (
        period.ensemble_starts_on,
        period.ensemble_ends_on,
        period.ensemble_room_id,
    )
    if first is None or last is None or room_id is None:
        raise ValueError("전체합주가 지정되지 않은 기간입니다")
    target = parse_calendar_date(day, "날짜")
    if not first <= target <= last:
        raise ValueError("전체합주 날짜 범위 밖의 날짜입니다")
    start, end = _ensemble_times(session, _get_room_or_raise(session, room_id), starts_at, ends_at)

    # 조회 후 INSERT 하면 같은 날짜를 동시에 저장하는 두 요청이 unique 제약에 걸리므로 한 문장으로 덮어씁니다.
    values = {"starts_at": start, "ends_at": end}
    session.execute(
        insert(EnsembleDay)
        .values(period_id=period_id, day=target, **values)
        .on_conflict_do_update(index_elements=["period_id", "day"], set_=values)
    )
    session.commit()
    return period


def delete_ensemble_day(session: Session, period_id: int, day: str) -> Period:
    """날짜 하나의 지정 시각을 삭제해 기본 시각으로 되돌립니다. 지정한 적 없는 날짜면 변경 없이 반환합니다."""
    period = _get_period_or_raise(session, period_id)
    target = parse_calendar_date(day, "날짜")
    session.execute(
        delete(EnsembleDay).where(EnsembleDay.period_id == period_id, EnsembleDay.day == target)
    )
    session.commit()
    return period


def days_by_period(session: Session, period_ids: list[int]) -> dict[int, list[EnsembleDay]]:
    """기간마다 날짜별 전체합주 시각을 날짜 순서로 모읍니다. 기간 수만큼 조회하지 않도록 한 번에 읽습니다."""
    grouped: defaultdict[int, list[EnsembleDay]] = defaultdict(list)
    rows = session.scalars(
        select(EnsembleDay)
        .where(EnsembleDay.period_id.in_(period_ids))
        .order_by(EnsembleDay.day)
    )
    for row in rows:
        grouped[row.period_id].append(row)
    return grouped
