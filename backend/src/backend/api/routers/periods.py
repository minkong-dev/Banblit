from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.services.input import format_calendar_date
from backend.services.input import format_clock
from backend.services.period_crud_service import create_period as create_period_row
from backend.services.period_crud_service import delete_period, list_periods, update_period
from backend.services.ensemble_service import (
    days_by_period,
    delete_ensemble,
    delete_ensemble_day,
    set_ensemble,
    set_ensemble_day,
)
from backend.api.schemas import (
    EnsembleDayIn,
    EnsembleDayOut,
    EnsembleIn,
    EnsembleOut,
    PeriodCreateIn,
    PeriodEnvelopeOut,
    PeriodOut,
    PeriodsOut,
    PeriodUpdateIn,
)
from backend.db.models import EnsembleDay, Period
from backend.db.pipeline import get_session

router = APIRouter()


def _ensemble_out(period: Period, days: list[EnsembleDay]) -> EnsembleOut | None:
    # 다섯 열은 CHECK 로 함께 채워지거나 함께 비지만, 타입 검사기가 알 수 있게 전부 확인합니다.
    starts_on, ends_on, room_id = (
        period.ensemble_starts_on,
        period.ensemble_ends_on,
        period.ensemble_room_id,
    )
    starts_at, ends_at = period.ensemble_starts_at, period.ensemble_ends_at
    if starts_on is None or ends_on is None or room_id is None or starts_at is None or ends_at is None:
        return None
    return EnsembleOut(
        starts_on=format_calendar_date(starts_on),
        ends_on=format_calendar_date(ends_on),
        room_id=room_id,
        starts_at=format_clock(starts_at),
        ends_at=format_clock(ends_at),
        days=[
            EnsembleDayOut(
                day=format_calendar_date(d.day),
                starts_at=format_clock(d.starts_at),
                ends_at=format_clock(d.ends_at),
            )
            for d in days
        ],
    )


def _period_out(period: Period, days: list[EnsembleDay]) -> PeriodOut:
    return PeriodOut(
        id=period.id,
        kind=period.kind,
        starts_on=format_calendar_date(period.starts_on),
        ends_on=format_calendar_date(period.ends_on),
        everyday=period.everyday,
        first_run_at=format_clock(period.first_run_at),
        second_run_at=format_clock(period.second_run_at),
        ensemble=_ensemble_out(period, days),
    )


def _envelope(session: Session, period: Period) -> PeriodEnvelopeOut:
    days = days_by_period(session, [period.id]).get(period.id, [])
    return PeriodEnvelopeOut(period=_period_out(period, days))


# 요청자의 신원을 사용하지 않고 권한만 검증하는 endpoint(API의 요청 주소 단위)는, 사용하지 않는
# 매개변수를 남기지 않도록 dependencies 에 추가합니다.
@router.get(
    "/periods", response_model=PeriodsOut, dependencies=[Depends(require_account)]
)
def read_periods(session: Session = Depends(get_session)) -> PeriodsOut:
    periods = list_periods(session)
    days = days_by_period(session, [p.id for p in periods])
    return PeriodsOut(periods=[_period_out(p, days.get(p.id, [])) for p in periods])


@router.post(
    "/periods",
    response_model=PeriodEnvelopeOut,
    status_code=201,
    dependencies=[Depends(require_permission("period_create"))],
)
def create_period(
    req: PeriodCreateIn,
    session: Session = Depends(get_session),
) -> PeriodEnvelopeOut:
    period = create_period_row(
        session,
        req.kind,
        req.starts_on,
        req.ends_on,
        req.everyday,
        req.first_run_at,
        req.second_run_at,
    )
    return _envelope(session, period)


@router.patch(
    "/periods/{period_id}",
    response_model=PeriodEnvelopeOut,
    dependencies=[Depends(require_permission("period_edit"))],
)
def patch_period(
    period_id: int,
    req: PeriodUpdateIn,
    session: Session = Depends(get_session),
) -> PeriodEnvelopeOut:
    period = update_period(
        session,
        period_id,
        req.kind,
        req.starts_on,
        req.ends_on,
        req.everyday,
        req.first_run_at,
        req.second_run_at,
    )
    return _envelope(session, period)


@router.delete(
    "/periods/{period_id}",
    status_code=204,
    dependencies=[Depends(require_permission("period_delete"))],
)
def delete_period_endpoint(
    period_id: int, session: Session = Depends(get_session)
) -> None:
    delete_period(session, period_id)


# 전체합주 설정은 기간 수정(PATCH)과 같은 권한입니다. 응답은 설정이 반영된 기간 전체입니다.
@router.put(
    "/periods/{period_id}/ensemble",
    response_model=PeriodEnvelopeOut,
    dependencies=[Depends(require_permission("period_edit"))],
)
def put_ensemble(
    period_id: int, req: EnsembleIn, session: Session = Depends(get_session)
) -> PeriodEnvelopeOut:
    period = set_ensemble(
        session, period_id, req.starts_on, req.ends_on, req.room_id, req.starts_at, req.ends_at
    )
    return _envelope(session, period)


@router.delete(
    "/periods/{period_id}/ensemble",
    response_model=PeriodEnvelopeOut,
    dependencies=[Depends(require_permission("period_edit"))],
)
def delete_ensemble_endpoint(
    period_id: int, session: Session = Depends(get_session)
) -> PeriodEnvelopeOut:
    return _envelope(session, delete_ensemble(session, period_id))


@router.put(
    "/periods/{period_id}/ensemble/days/{day}",
    response_model=PeriodEnvelopeOut,
    dependencies=[Depends(require_permission("period_edit"))],
)
def put_ensemble_day(
    period_id: int, day: str, req: EnsembleDayIn, session: Session = Depends(get_session)
) -> PeriodEnvelopeOut:
    period = set_ensemble_day(session, period_id, day, req.starts_at, req.ends_at)
    return _envelope(session, period)


@router.delete(
    "/periods/{period_id}/ensemble/days/{day}",
    response_model=PeriodEnvelopeOut,
    dependencies=[Depends(require_permission("period_edit"))],
)
def delete_ensemble_day_endpoint(
    period_id: int, day: str, session: Session = Depends(get_session)
) -> PeriodEnvelopeOut:
    return _envelope(session, delete_ensemble_day(session, period_id, day))
