from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.api.reservation_input import (
    require_same_day,
    require_valid_slot_bounds,
    require_within_room_hours,
)
from backend.db.models import Member, Period, Reservation, Room, Team
from backend.scheduling.pipeline import TimeInterval, generate_slots

# reservations 테이블의 (room_id, starts_at) 유니크 제약 이름. schedule_store.py의
# _ROOM_TIME_CONFLICT_CONSTRAINT와 같은 얼개 — 먼저 커밋한 쪽이 그 칸을 가져간다.
_ROOM_TIME_CONFLICT_CONSTRAINT = "reservations_room_id_starts_at_key"

ReservationRow = tuple[Reservation, str, str | None, str]


def _get_room_or_raise(session: Session, room_id: int) -> Room:
    room = session.get(Room, room_id)
    if room is None:
        raise ValueError("그런 합주실이 없습니다")
    return room


def _get_member_or_raise(session: Session, member_id: int) -> Member:
    member = session.get(Member, member_id)
    if member is None:
        raise ValueError("그런 사람이 없습니다")
    return member


def _get_team_or_raise(session: Session, team_id: int) -> Team:
    team = session.get(Team, team_id)
    if team is None:
        raise ValueError("그런 팀이 없습니다")
    return team


def _require_within_open_period(session: Session, day: date) -> None:
    # 상시 개방기간 안에서만 예약을 받는다. 집중 합주기간은 자동 배정 대상이라
    # 예약 화면에서 언제나 잠겨 있다(.cluedoc/scheduler README, 예약 모드 표).
    covered = session.execute(
        select(Period.id).where(
            Period.kind == "open",
            Period.starts_on <= day,
            Period.ends_on >= day,
        )
    ).first()
    if covered is None:
        raise ValueError("상시 개방기간이 아니어서 예약할 수 없습니다")


def _conflict_message_for(error: IntegrityError) -> str | None:
    diag = getattr(error.orig, "diag", None)
    constraint_name = getattr(diag, "constraint_name", None)
    if constraint_name != _ROOM_TIME_CONFLICT_CONSTRAINT:
        return None
    return "이미 다른 사람이 예약한 시간입니다. 다른 시간을 골라 주세요"


def create_reservation(
    session: Session,
    room_id: int,
    member_id: int,
    team_id: int | None,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
) -> tuple[list[Reservation], str, str, str | None]:
    """예약 하나를 30분 칸 행으로 나눠 만든다. 한 칸이라도 이미 찼으면 전부 되돌린다.

    선착순은 이 표의 (room_id, starts_at) 유니크 제약이 커밋 시점에 정한다 —
    schedule_store.save_schedule과 같은 방식이다. 검증 과정에서 이미 읽은 방·사람·팀의
    이름을 함께 돌려줘, 부르는 쪽이 이름을 붙이려고 다시 조회하지 않게 한다.
    """
    # 로그인이 붙으면 여기서 토큰의 주인이 이 member_id 본인인지 확인한다. 지금은
    # 요청한 사람이 누구인지 서버가 모르므로 이 규칙을 걸 수 없다.
    require_valid_slot_bounds(starts_at, ends_at)
    require_same_day(starts_at, ends_at)
    room = _get_room_or_raise(session, room_id)
    require_within_room_hours(room.opens_at, room.closes_at, starts_at, ends_at)
    member = _get_member_or_raise(session, member_id)
    team = _get_team_or_raise(session, team_id) if team_id is not None else None
    _require_within_open_period(session, starts_at.date())

    slots = generate_slots(TimeInterval(start=starts_at, end=ends_at))
    rows = [
        Reservation(
            room_id=room_id,
            team_id=team_id,
            member_id=member_id,
            starts_at=slot.start,
            ends_at=slot.end,
            created_at=created_at,
        )
        for slot in slots
    ]
    session.add_all(rows)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        message = _conflict_message_for(error)
        if message is None:
            raise
        raise ValueError(message) from error
    return rows, room.name, member.name, team.name if team is not None else None


def list_reservations(
    session: Session, room_id: int, from_date: date, to_date: date
) -> tuple[Room, list[ReservationRow]]:
    """room_id 하나의 [from_date, to_date] 범위 예약을 시작 시각 순으로 돌려준다.

    행마다 방 이름·팀 이름(팀 예약이 아니면 None)·예약한 사람 이름을 함께 붙인다.
    """
    room = _get_room_or_raise(session, room_id)
    range_start = datetime.combine(from_date, time.min)
    range_end = datetime.combine(to_date, time.max)
    rows = session.execute(
        select(Reservation, Team.name, Member.name)
        .join(Member, Member.id == Reservation.member_id)
        .outerjoin(Team, Team.id == Reservation.team_id)
        .where(Reservation.room_id == room_id)
        .where(Reservation.starts_at >= range_start)
        .where(Reservation.starts_at <= range_end)
        .order_by(Reservation.starts_at)
    ).all()
    return room, [
        (reservation, room.name, team_name, member_name)
        for reservation, team_name, member_name in rows
    ]


def cancel_reservation(session: Session, reservation_id: int, member_id: int) -> None:
    """예약 칸 하나를 취소한다. 지금은 그 칸을 예약한 사람 본인인지만 확인한다.

    ponytail: 여러 칸을 이어 쓴 예약은 칸마다 id가 달라, 전부 취소하려면 칸마다
    이 통로를 호출해야 한다. "예약 하나를 통째로 취소" UI가 생기면 그때 묶음 번호를
    붙인다 — 지금 화면(DayDialog)에는 취소 버튼 자체가 없어 이 통로는 API로만 쓰인다.
    """
    # 로그인이 붙으면 여기서 토큰의 주인이 이 member_id 본인인지 확인한다.
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise ValueError("그런 예약이 없습니다")
    if reservation.member_id != member_id:
        raise ValueError("본인이 예약한 자리만 취소할 수 있습니다")
    session.delete(reservation)
    session.commit()
