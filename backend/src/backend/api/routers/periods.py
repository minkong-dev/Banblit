from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.services.input import format_calendar_date
from backend.services.input import format_clock
from backend.services.period_crud_service import create_period as create_period_row
from backend.services.period_crud_service import delete_period, list_periods, update_period
from backend.api.schemas import (
    PeriodCreateIn,
    PeriodEnvelopeOut,
    PeriodOut,
    PeriodsOut,
    PeriodUpdateIn,
)
from backend.db.models import Period
from backend.db.pipeline import get_session

router = APIRouter()


def _period_out(period: Period) -> PeriodOut:
    return PeriodOut(
        id=period.id,
        kind=period.kind,
        starts_on=format_calendar_date(period.starts_on),
        ends_on=format_calendar_date(period.ends_on),
        everyday=period.everyday,
        first_run_at=format_clock(period.first_run_at),
        second_run_at=format_clock(period.second_run_at),
    )


# 요청자의 신원을 사용하지 않고 권한만 검증하는 endpoint(API의 요청 주소 단위)는, 사용하지 않는
# 매개변수를 남기지 않도록 dependencies 에 추가합니다.
@router.get(
    "/periods", response_model=PeriodsOut, dependencies=[Depends(require_account)]
)
def read_periods(session: Session = Depends(get_session)) -> PeriodsOut:
    return PeriodsOut(periods=[_period_out(p) for p in list_periods(session)])


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
    return PeriodEnvelopeOut(period=_period_out(period))


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
    return PeriodEnvelopeOut(period=_period_out(period))


@router.delete(
    "/periods/{period_id}",
    status_code=204,
    dependencies=[Depends(require_permission("period_delete"))],
)
def delete_period_endpoint(
    period_id: int, session: Session = Depends(get_session)
) -> None:
    delete_period(session, period_id)
