from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.api.schemas import (
    UnavailableCreateIn,
    UnavailableEnvelopeOut,
    UnavailableOut,
    UnavailableTimesOut,
)
from backend.api.unavailable_service import (
    create_unavailable,
    delete_unavailable,
    list_unavailable,
)
from backend.db.models import Member, UnavailableTime
from backend.db.pipeline import get_session

router = APIRouter()


def _unavailable_out(row: UnavailableTime) -> UnavailableOut:
    return UnavailableOut(
        id=row.id,
        member_id=row.member_id,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        repeats_weekly=row.repeats_weekly,
        repeat_until=row.repeat_until,
    )


@router.get("/members/{member_id}/unavailable", response_model=UnavailableTimesOut)
def read_unavailable(
    member_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> UnavailableTimesOut:
    rows = list_unavailable(session, member_id, requester)
    return UnavailableTimesOut(times=[_unavailable_out(row) for row in rows])


@router.post(
    "/members/{member_id}/unavailable",
    response_model=UnavailableEnvelopeOut,
    status_code=201,
)
def create_unavailable_endpoint(
    member_id: int,
    req: UnavailableCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> UnavailableEnvelopeOut:
    row = create_unavailable(
        session,
        member_id,
        requester,
        req.starts_at,
        req.ends_at,
        req.repeats_weekly,
        req.repeat_until,
    )
    return UnavailableEnvelopeOut(time=_unavailable_out(row))


@router.delete("/members/{member_id}/unavailable/{time_id}", status_code=204)
def delete_unavailable_endpoint(
    member_id: int,
    time_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    delete_unavailable(session, member_id, requester, time_id)
