from datetime import time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.api.room_input import (
    parse_clock,
    require_closes_after_opens,
    require_half_hour_grid,
    require_room_name,
)
from backend.db.models import Room

# 실제 DB에서 확인한 이름 유니크 제약(docker compose exec db psql -c "\d rooms").
ROOM_NAME_CONSTRAINT = "rooms_name_key"


def list_rooms(session: Session) -> list[Room]:
    return list(session.scalars(select(Room).order_by(Room.id)).all())


def create_room(session: Session, name: str, opens_at: str, closes_at: str) -> Room:
    """새 합주실을 만든다. 경계에서 이름·격자·순서·이름 중복을 사람이 읽을 문장으로 거절한다."""
    clean_name = require_room_name(name)
    opens = _parse_room_clock(opens_at, "여는 시각")
    closes = _parse_room_clock(closes_at, "닫는 시각")
    require_closes_after_opens(opens, closes)
    _require_unique_name(session, clean_name, exclude_id=None)

    room = Room(name=clean_name, opens_at=opens, closes_at=closes)
    session.add(room)
    commit_room(session)
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

    new_name = None
    if name is not None:
        new_name = require_room_name(name)
        # 자기 이름을 그대로 두는 PATCH는 거부하면 안 되므로 자기 자신은 제외하고 찾는다.
        _require_unique_name(session, new_name, exclude_id=room_id)

    if new_name is not None:
        room.name = new_name
    room.opens_at = new_opens
    room.closes_at = new_closes
    commit_room(session)
    return room


def duplicate_name_message(error: IntegrityError) -> str | None:
    """유니크 위반이 합주실 이름 중복이면 사람이 읽을 문장을, 아니면 None을 돌려준다.

    이름 중복 사전 검사(SELECT, _require_unique_name)와 commit 사이에는 잠금이 없다.
    같은 이름으로 두 요청이 동시에 들어오면 둘 다 사전 검사를 통과하고, 나중 커밋에서
    이 제약이 걸릴 수 있다 — schedule_store.conflict_message_for와 같은 얼개로 잡는다.
    """
    diag = getattr(error.orig, "diag", None)
    constraint_name = getattr(diag, "constraint_name", None)
    if constraint_name != ROOM_NAME_CONSTRAINT:
        return None
    return "이미 있는 합주실 이름입니다"


def commit_room(session: Session) -> None:
    """커밋 시점에 실제로 걸린 이름 중복을 사람이 읽을 문장으로 바꿔 올린다.

    모르는 제약이면 원래 IntegrityError를 그대로 올려 500으로 드러나게 둔다 —
    아는 사고가 아닌데 아는 척 문구를 붙이면 엉뚱한 곳을 고치게 만든다.
    """
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        message = duplicate_name_message(error)
        if message is None:
            raise
        raise ValueError(message) from error


def _parse_room_clock(value: str, field_label: str) -> time:
    clock = parse_clock(value, field_label)
    require_half_hour_grid(clock, field_label)
    return clock


def _require_unique_name(session: Session, name: str, exclude_id: int | None) -> None:
    query = select(Room.id).where(Room.name == name)
    if exclude_id is not None:
        query = query.where(Room.id != exclude_id)
    if session.scalars(query).first() is not None:
        raise ValueError("이미 있는 합주실 이름입니다")
