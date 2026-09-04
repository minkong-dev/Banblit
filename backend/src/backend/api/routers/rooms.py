from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.room_input import format_clock as format_room_clock
from backend.api.room_service import create_room as create_room_row
from backend.api.room_service import list_rooms, update_room
from backend.api.schemas import RoomCreateIn, RoomEnvelopeOut, RoomOut, RoomsOut, RoomUpdateIn
from backend.db.models import Room
from backend.db.pipeline import get_session

router = APIRouter()


def _room_out(room: Room) -> RoomOut:
    return RoomOut(
        id=room.id,
        name=room.name,
        opens_at=format_room_clock(room.opens_at),
        closes_at=format_room_clock(room.closes_at),
    )


@router.get("/rooms", response_model=RoomsOut)
def read_rooms(session: Session = Depends(get_session)) -> RoomsOut:
    return RoomsOut(rooms=[_room_out(room) for room in list_rooms(session)])


@router.post("/rooms", response_model=RoomEnvelopeOut, status_code=201)
def create_room(
    req: RoomCreateIn, session: Session = Depends(get_session)
) -> RoomEnvelopeOut:
    try:
        room = create_room_row(session, req.name, req.opens_at, req.closes_at)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return RoomEnvelopeOut(room=_room_out(room))


@router.patch("/rooms/{room_id}", response_model=RoomEnvelopeOut)
def patch_room(
    room_id: int, req: RoomUpdateIn, session: Session = Depends(get_session)
) -> RoomEnvelopeOut:
    try:
        room = update_room(session, room_id, req.name, req.opens_at, req.closes_at)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return RoomEnvelopeOut(room=_room_out(room))
