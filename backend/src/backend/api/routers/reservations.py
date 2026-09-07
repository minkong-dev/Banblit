from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.api.period_crud_input import parse_calendar_date
from backend.api.reservation_service import (
    ReservationRow,
    cancel_reservation,
    create_reservation,
    list_reservations,
    update_reservation,
)
from backend.api.schemas import (
    ReservationCreateIn,
    ReservationOut,
    ReservationsOut,
    ReservationUpdateIn,
)
from backend.db.models import Member, Reservation
from backend.db.pipeline import get_session

router = APIRouter()


def _reservation_out(reservation: Reservation, room_name: str, team_name: str | None, member_name: str) -> ReservationOut:
    return ReservationOut(
        id=reservation.id,
        room_id=reservation.room_id,
        room=room_name,
        team_id=reservation.team_id,
        team=team_name,
        member_id=reservation.member_id,
        member=member_name,
        start=reservation.starts_at,
        end=reservation.ends_at,
    )


def _rows_out(rows: list[ReservationRow]) -> ReservationsOut:
    return ReservationsOut(
        reservations=[
            _reservation_out(reservation, room_name, team_name, member_name)
            for reservation, room_name, team_name, member_name in rows
        ]
    )


# 일정 확인은 로그인한 사람이면 누구나 한다. 누구인지는 쓰지 않으므로 쓰이지 않는
# 인자를 남기지 않도록 dependencies 로 건다.
@router.get(
    "/rooms/{room_id}/reservations",
    response_model=ReservationsOut,
    dependencies=[Depends(require_account)],
)
def read_room_reservations(
    room_id: int,
    from_: str = Query(alias="from"),
    to: str = Query(),
    session: Session = Depends(get_session),
) -> ReservationsOut:
    # from_ 은 파이썬이 예약어 from 을 매개변수 이름으로 못 써 붙인 이름이다.
    # alias="from" 이 실제 쿼리 문자열 키를 맞춘다(?from=...&to=...).
    try:
        from_date = parse_calendar_date(from_, "from")
        to_date = parse_calendar_date(to, "to")
        _, rows = list_reservations(session, room_id, from_date, to_date)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _rows_out(rows)


@router.post("/reservations", response_model=ReservationsOut, status_code=201)
def create_reservation_endpoint(
    req: ReservationCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> ReservationsOut:
    try:
        # 예약의 주인은 요청 본문이 아니라 쿠키의 주인이다 — 남의 이름으로 잡을 수 없다.
        rows, room_name, member_name, team_name = create_reservation(
            session,
            req.room_id,
            requester,
            req.team_id,
            req.starts_at,
            req.ends_at,
            datetime.now(),
        )
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _rows_out([(row, room_name, team_name, member_name) for row in rows])


@router.patch("/reservations/{reservation_id}", response_model=ReservationsOut)
def update_reservation_endpoint(
    reservation_id: int,
    req: ReservationUpdateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> ReservationsOut:
    try:
        # 옮길 자리를 새로 잡는 것이므로, 잡은 시각은 옮긴 지금이다.
        rows, room_name, member_name, team_name = update_reservation(
            session,
            reservation_id,
            requester,
            req.starts_at,
            req.ends_at,
            datetime.now(),
        )
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _rows_out([(row, room_name, team_name, member_name) for row in rows])


@router.delete("/reservations/{reservation_id}", status_code=204)
def cancel_reservation_endpoint(
    reservation_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    try:
        cancel_reservation(session, reservation_id, requester)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
