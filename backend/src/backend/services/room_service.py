from datetime import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.input import (
    parse_clock,
    require_closes_after_opens,
    require_on_the_hour,
    require_non_empty,
)
from backend.db.models import Room
from backend.db.pipeline import commit_translating

# 위반될 수 있는 제약 조건과 그때 사용자에게 표시할 문장입니다. 제약 조건 이름은 migration(DB 구조를 바꾸는 단계별 기록)이 정한 이름입니다.
ROOM_MESSAGES = {"rooms_name_key": "이미 있는 합주실 이름입니다"}


def list_rooms(session: Session) -> list[Room]:
    return list(session.scalars(select(Room).order_by(Room.id)).all())


def create_room(session: Session, name: str, opens_at: str, closes_at: str) -> Room:
    """새 합주실을 생성합니다. 이름이 비어 있는지, 시각이 HH:MM 형식이고 정시인지, 닫는 시각이 여는 시각보다 늦은지, 이름이 중복인지를 사람이 읽을 수 있는 문장으로 검증합니다."""
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
    """전달된 항목만 수정합니다. 전달되지 않은 항목은 기존 값을 그대로 검증에 다시 적용합니다."""
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
