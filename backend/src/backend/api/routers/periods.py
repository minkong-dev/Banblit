from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.period_crud_input import format_calendar_date
from backend.api.period_crud_input import format_clock as format_period_clock
from backend.api.period_crud_service import create_period as create_period_row
from backend.api.period_crud_service import list_periods, update_period
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
        first_run_at=format_period_clock(period.first_run_at),
        second_run_at=format_period_clock(period.second_run_at),
    )


@router.get("/periods", response_model=PeriodsOut)
def read_periods(session: Session = Depends(get_session)) -> PeriodsOut:
    return PeriodsOut(periods=[_period_out(p) for p in list_periods(session)])


@router.post("/periods", response_model=PeriodEnvelopeOut, status_code=201)
def create_period(
    req: PeriodCreateIn, session: Session = Depends(get_session)
) -> PeriodEnvelopeOut:
    try:
        period = create_period_row(
            session,
            req.kind,
            req.starts_on,
            req.ends_on,
            req.everyday,
            req.first_run_at,
            req.second_run_at,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return PeriodEnvelopeOut(period=_period_out(period))


@router.patch("/periods/{period_id}", response_model=PeriodEnvelopeOut)
def patch_period(
    period_id: int, req: PeriodUpdateIn, session: Session = Depends(get_session)
) -> PeriodEnvelopeOut:
    try:
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
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return PeriodEnvelopeOut(period=_period_out(period))
