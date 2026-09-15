from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.services.input import parse_calendar_date
from backend.services.reservation_service import (
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
        name=reservation.name,
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


# 일정 확인은 로그인한 사람이면 누구나 합니다. 사용자 신원을 사용하지 않으므로 사용하지 않는
# 매개변수를 남기지 않도록 dependencies 에 추가합니다.
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
    # from 은 Python 의 예약어이므로 매개변수 이름으로 사용할 수 없어 from_ 으로 지었습니다.
    # alias="from" 이 실제 query string(URL 의 ? 뒤에 오는 key=value 목록) 키와 맞춥니다(?from=...&to=...).
    from_date = parse_calendar_date(from_, "from")
    to_date = parse_calendar_date(to, "to")
    rows = list_reservations(session, room_id, from_date, to_date)
    return _rows_out(rows)


@router.post("/reservations", response_model=ReservationsOut, status_code=201)
def create_reservation_endpoint(
    req: ReservationCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> ReservationsOut:
    # 예약자는 요청 body(본문)가 아니라 cookie(브라우저가 저장해 요청마다 함께 보내는 값)로 확인한 requester 입니다. 다른 사람 이름으로 예약할 수 없습니다.
    row, room_name, member_name, team_name = create_reservation(
        session,
        req.room_id,
        requester,
        req.team_id,
        req.name,
        req.starts_at,
        req.ends_at,
        datetime.now(),
    )
    return _rows_out([(row, room_name, team_name, member_name)])


@router.patch("/reservations/{reservation_id}", response_model=ReservationsOut)
def update_reservation_endpoint(
    reservation_id: int,
    req: ReservationUpdateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> ReservationsOut:
    # 예약한 시각(created_at)은 처음 잡은 때 그대로 둡니다. 옮긴 것이지 새로 잡은 것이 아닙니다.
    row, room_name, member_name, team_name = update_reservation(
        session,
        reservation_id,
        requester,
        req.starts_at,
        req.ends_at,
    )
    return _rows_out([(row, room_name, team_name, member_name)])


@router.delete("/reservations/{reservation_id}", status_code=204)
def cancel_reservation_endpoint(
    reservation_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    cancel_reservation(session, reservation_id, requester)
