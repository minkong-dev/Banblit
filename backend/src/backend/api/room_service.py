from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.input import (
    parse_clock,
    require_closes_after_opens,
    require_on_the_hour,
    require_non_empty,
)
from backend.db.models import Room
from backend.db.pipeline import commit_translating

# 걸릴 수 있는 제약과 그때 사람에게 보일 문장. 이름은 마이그레이션이 만든 것이다.
ROOM_MESSAGES = {"rooms_name_key": "이미 있는 합주실 이름입니다"}


def list_rooms(session: Session) -> list[Room]:
    return list(session.scalars(select(Room).order_by(Room.id)).all())


def create_room(session: Session, name: str, opens_at: str, closes_at: str) -> Room:
    """새 합주실을 만든다. 경계에서 이름·격자·순서·이름 중복을 사람이 읽을 문장으로 거절한다."""
    clean_name = require_non_empty(name, "합주실 이름")
    opens = _parse_room_clock(opens_at, "여는 시각")
    closes = _parse_room_clock(closes_at, "닫는 시각")
    require_closes_after_opens(opens, closes)

    room = Room(name=clean_name, opens_at=opens, closes_at=closes)
    session.add(room)
    commit_translating(session, ROOM_MESSAGES)
    return room


def update_room(
    session: Session,
    room_id: int,
    name: str | None,
    opens_at: str | None,
    closes_at: str | None,
) -> Room:
    """보낸 항목만 고친다. 안 보낸 항목은 기존 값을 그대로 검증에 다시 태운다."""
    room = session.get(Room, room_id)
    if room is None:
        raise ValueError("그런 합주실이 없습니다")

    new_opens = (
        _parse_room_clock(opens_at, "여는 시각") if opens_at is not None else room.opens_at
    )
    new_closes = (
        _parse_room_clock(closes_at, "닫는 시각")
        if closes_at is not None
        else room.closes_at
    )
    require_closes_after_opens(new_opens, new_closes)

    if name is not None:
        room.name = require_non_empty(name, "합주실 이름")
    room.opens_at = new_opens
    room.closes_at = new_closes
    commit_translating(session, ROOM_MESSAGES)
    return room


def _parse_room_clock(value: str, field_label: str) -> time:
    clock = parse_clock(value, field_label)
    require_on_the_hour(clock, field_label)
    return clock
