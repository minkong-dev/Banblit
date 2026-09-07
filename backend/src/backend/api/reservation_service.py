from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.api.reservation_input import (
    require_same_day,
    require_valid_slot_bounds,
    require_within_room_hours,
)
from backend.db.models import Member, Period, Reservation, Room, Team, TeamSlot
from backend.scheduling.pipeline import TimeInterval, generate_slots

# reservations 테이블의 (room_id, starts_at) 유니크 제약 이름. schedule_store.py의
# _ROOM_TIME_CONFLICT_CONSTRAINT와 같은 얼개 — 먼저 커밋한 쪽이 그 slot 을 가져간다.
_ROOM_TIME_CONFLICT_CONSTRAINT = "reservations_room_id_starts_at_key"

ReservationRow = tuple[Reservation, str, str | None, str]


def _get_room_or_raise(session: Session, room_id: int) -> Room:
    room = session.get(Room, room_id)
    if room is None:
        raise ValueError("그런 합주실이 없습니다")
    return room


def _require_team_member(session: Session, team_id: int, member_id: int) -> None:
    # 승인 대기(status="pending")는 아직 소속이 아니므로 그 팀 이름으로 예약할 수 없다.
    row = session.execute(
        select(TeamSlot.id).where(
            TeamSlot.team_id == team_id,
            TeamSlot.member_id == member_id,
        )
    ).first()
    if row is None:
        raise PermissionError("그 팀 소속이 아닙니다")


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


def _planned_rows(
    session: Session,
    room_id: int,
    requester: Member,
    team_id: int | None,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
) -> tuple[list[Reservation], Room, Team | None]:
    """요청한 구간을 검증하고 30분 slot 행들을 만들어, 방·팀과 함께 돌려준다.

    행은 아직 session에 넣지 않는다 — 넣는 시점과 커밋 범위는 부르는 쪽이 정한다.
    """
    require_valid_slot_bounds(starts_at, ends_at)
    require_same_day(starts_at, ends_at)
    room = _get_room_or_raise(session, room_id)
    require_within_room_hours(room.opens_at, room.closes_at, starts_at, ends_at)
    team = None
    if team_id is not None:
        team = _get_team_or_raise(session, team_id)
        _require_team_member(session, team_id, requester.id)
    _require_within_open_period(session, starts_at.date())

    slots = generate_slots(TimeInterval(start=starts_at, end=ends_at))
    rows = [
        Reservation(
            room_id=room_id,
            team_id=team_id,
            member_id=requester.id,
            starts_at=slot.start,
            ends_at=slot.end,
            created_at=created_at,
        )
        for slot in slots
    ]
    return rows, room, team


def _commit_or_translate_conflict(session: Session) -> None:
    """커밋한다. (room_id, starts_at) 유니크 제약에 걸리면 되돌리고 ValueError로 바꾼다.

    되돌리기가 트랜잭션 전체를 물리므로, 같은 트랜잭션에서 지운 행도 함께 살아난다.
    """
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        message = _conflict_message_for(error)
        if message is None:
            raise
        raise ValueError(message) from error


def create_reservation(
    session: Session,
    room_id: int,
    requester: Member,
    team_id: int | None,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
) -> tuple[list[Reservation], str, str, str | None]:
    """예약 하나를 30분 slot 행으로 나눠 만든다. 한 slot 이라도 이미 찼으면 전부 되돌린다.

    선착순은 reservations table 의 (room_id, starts_at) 유니크 제약이 커밋 시점에 정한다 —
    schedule_store.save_schedule과 같은 방식이다. 검증 과정에서 이미 읽은 방·사람·팀의
    이름을 함께 돌려줘, 부르는 쪽이 이름을 붙이려고 다시 조회하지 않게 한다.
    """
    rows, room, team = _planned_rows(
        session, room_id, requester, team_id, starts_at, ends_at, created_at
    )
    session.add_all(rows)
    _commit_or_translate_conflict(session)
    return rows, room.name, requester.name, team.name if team is not None else None


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


def _get_own_reservation(
    session: Session, reservation_id: int, requester: Member, verb: str
) -> Reservation:
    """reservation_id 의 slot 을 찾아, 그 slot 을 예약한 사람이 requester 일 때만 돌려준다.

    없는 slot 은 ValueError, 남의 slot 은 PermissionError 로 갈라 던진다 — 부르는 쪽이
    "잘못된 요청"과 "권한 없음"을 다른 응답 코드로 내보낸다. verb 는 거절 문구에
    들어가는 동작 이름이다("취소할", "옮길").
    """
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise ValueError("그런 예약이 없습니다")
    if reservation.member_id != requester.id:
        raise PermissionError(f"본인이 예약한 자리만 {verb} 수 있습니다")
    return reservation


def cancel_reservation(session: Session, reservation_id: int, requester: Member) -> None:
    """예약 slot 하나를 취소한다. 그 slot 을 예약한 사람 본인만 지울 수 있다.

    ponytail: 여러 slot 을 이어 쓴 예약은 slot 마다 id가 달라, 전부 취소하려면 slot 마다
    이 endpoint 를 호출해야 한다. "예약 하나를 통째로 취소" UI가 생기면 그때 예약을
    묶는 번호를 붙인다 — 지금 화면(DayDialog)에는 취소 버튼 자체가 없어 이 endpoint 는
    API로만 쓰인다.
    """
    reservation = _get_own_reservation(session, reservation_id, requester, "취소할")
    session.delete(reservation)
    session.commit()


def update_reservation(
    session: Session,
    reservation_id: int,
    requester: Member,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
) -> tuple[list[Reservation], str, str, str | None]:
    """예약 slot 하나를 다른 시각으로 옮긴다. 방과 팀은 그대로 두고 시각만 바꾼다.

    옛 slot 을 지우고 새 slot 을 넣는 것을 한 트랜잭션에서 한다. 옮길 slot 이 이미 차
    있으면 커밋이 유니크 제약에 걸리고, 되돌리기가 옛 slot 까지 함께 살려 원래 slot 을
    잃지 않는다. 지우기를 먼저 flush 하는 것은 SQLAlchemy 가 기본적으로 INSERT 를
    DELETE 보다 먼저 보내기 때문이다 — 그대로 두면 겹치는 slot(같은 slot, 이어진 slot)
    으로 옮길 때 자기 자신과 부딪힌다.

    ponytail: cancel_reservation 과 같은 한계로, 옮기는 단위는 slot 하나다. 여러 slot 을
    이어 쓴 예약을 통째로 옮기려면 slot 마다 이 endpoint 를 호출해야 한다. 다만 새
    구간이 여러 slot 이면 slot 수는 늘어난다 — create_reservation 과 같은 규칙으로 쪼갠다.
    """
    reservation = _get_own_reservation(session, reservation_id, requester, "옮길")
    rows, room, team = _planned_rows(
        session,
        reservation.room_id,
        requester,
        reservation.team_id,
        starts_at,
        ends_at,
        created_at,
    )
    session.delete(reservation)
    session.flush()
    session.add_all(rows)
    _commit_or_translate_conflict(session)
    return rows, room.name, requester.name, team.name if team is not None else None
