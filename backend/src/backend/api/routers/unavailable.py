from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.api.schemas import (
    UnavailableCreateIn,
    UnavailableEnvelopeOut,
    UnavailableOut,
    UnavailableTimesOut,
)
from backend.services.unavailable_service import (
    create_unavailable,
    delete_unavailable,
    update_unavailable,
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
        repeat_weekdays=row.repeat_weekdays,
        repeat_count=row.repeat_count,
        repeat_until=row.repeat_until,
        reason=row.reason,
        name=row.name,
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
        req.repeat_weekdays,
        req.repeat_count,
        req.repeat_until,
        req.reason,
        req.name,
    )
    return UnavailableEnvelopeOut(time=_unavailable_out(row))


# 수정은 생성과 같은 본문을 받아 전부 덮어씁니다. 일부만 받으면 반복 요일·횟수·종료일의 조합을
# 보내지 않은 값과 함께 판정해야 해서, 어느 조합이 거부되는지 사용자가 예측할 수 없습니다.
@router.patch(
    "/members/{member_id}/unavailable/{time_id}",
    response_model=UnavailableEnvelopeOut,
)
def update_unavailable_endpoint(
    member_id: int,
    time_id: int,
    req: UnavailableCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> UnavailableEnvelopeOut:
    row = update_unavailable(
        session,
        member_id,
        requester,
        time_id,
        req.starts_at,
        req.ends_at,
        req.repeat_weekdays,
        req.repeat_count,
        req.repeat_until,
        req.reason,
        req.name,
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
