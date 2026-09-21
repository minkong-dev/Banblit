from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.services.input import format_clock
from backend.services.room_service import create_room as create_room_row
from backend.services.room_service import delete_room as delete_room_row
from backend.services.room_service import list_rooms, update_room
from backend.api.schemas import RoomCreateIn, RoomEnvelopeOut, RoomOut, RoomsOut, RoomUpdateIn
from backend.db.models import Room
from backend.db.pipeline import get_session

router = APIRouter()


def _room_out(room: Room) -> RoomOut:
    return RoomOut(
        id=room.id,
        name=room.name,
        opens_at=format_clock(room.opens_at),
        closes_at=format_clock(room.closes_at),
    )


# 요청자의 신원을 사용하지 않고 권한만 검증하는 endpoint(API의 요청 주소 단위)는, 사용하지 않는
# 매개변수를 남기지 않도록 dependencies 에 추가합니다.
@router.get("/rooms", response_model=RoomsOut, dependencies=[Depends(require_account)])
def read_rooms(session: Session = Depends(get_session)) -> RoomsOut:
    return RoomsOut(rooms=[_room_out(room) for room in list_rooms(session)])


@router.post(
    "/rooms",
    response_model=RoomEnvelopeOut,
    status_code=201,
    dependencies=[Depends(require_permission("room_create"))],
)
def create_room(
    req: RoomCreateIn,
    session: Session = Depends(get_session),
) -> RoomEnvelopeOut:
    room = create_room_row(session, req.name, req.opens_at, req.closes_at)
    return RoomEnvelopeOut(room=_room_out(room))


@router.delete(
    "/rooms/{room_id}",
    status_code=204,
    dependencies=[Depends(require_permission("room_delete"))],
)
def remove_room(room_id: int, session: Session = Depends(get_session)) -> None:
    """합주실 하나를 삭제합니다. 그 합주실의 예약·배정 결과·이전 배정기록도 함께 삭제됩니다."""
    delete_room_row(session, room_id)


@router.patch(
    "/rooms/{room_id}",
    response_model=RoomEnvelopeOut,
    dependencies=[Depends(require_permission("room_edit"))],
)
def patch_room(
    room_id: int,
    req: RoomUpdateIn,
    session: Session = Depends(get_session),
) -> RoomEnvelopeOut:
    room = update_room(session, room_id, req.name, req.opens_at, req.closes_at)
    return RoomEnvelopeOut(room=_room_out(room))
