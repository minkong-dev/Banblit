from datetime import date, datetime, time

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.services.input import (
    require_same_day,
    require_valid_slot_bounds,
    require_within_room_hours,
)
from backend.services.permission_service import account_permissions
from backend.services.settings_service import slot_minutes
from backend.db.models import Member, Period, Reservation, Room, Team, TeamSlot
from backend.db.pipeline import commit_translating

# 선착순은 겹침 금지 제약이 commit 시점에 정합니다. 먼저 commit 한 요청이 그 구간을 가져갑니다.
# 제약 이름은 migration 이 정한 이름입니다(c8e4a1b60d93_reservation_as_one_row.py).
RESERVATION_MESSAGES = {
    "reservations_no_overlap": "이미 다른 사람이 예약한 시간입니다. 다른 시간을 골라 주세요",
}

ReservationRow = tuple[Reservation, str, str | None, str]


def _get_room_or_raise(session: Session, room_id: int) -> Room:
    room = session.get(Room, room_id)
    if room is None:
        raise ValueError("그런 합주실이 없습니다")
    return room


def _require_team_member(session: Session, team_id: int, member_id: int) -> None:
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


def _require_not_in_focused_period(session: Session, day: date) -> None:
    """집중 합주기간이 아닐 경우 예약을 허용합니다.

    차단하는 기간은 집중 합주기간뿐입니다. 그 기간만 자동 배정이 모든 slot 을 팀에 나누어 배정합니다.
    기간을 정하지 않은 날도 예약할 수 있습니다. 과거 규칙은 "상시 개방" 기간을 따로 등록해야
    예약이 열렸지만, 등록을 잊으면 예약이 불가능하므로 기본값으로 예약을 허용하도록 규칙을
    변경했습니다(사용자 결정).

    "매일"(everyday) 이 켜진 집중 합주기간은 종료일이 없습니다(사용자 결정 2026-09-11). 시작일이
    지난 모든 날에 자동 배정이 실행되므로, 저장된 종료일 뒤의 날짜도 차단합니다.
    """
    covered = session.execute(
        select(Period.id).where(
            Period.kind == "focused",
            Period.starts_on <= day,
            or_(Period.everyday.is_(True), Period.ends_on >= day),
        )
    ).first()
    if covered is not None:
        raise ValueError("집중 합주기간이라 예약할 수 없습니다")


def _planned_row(
    session: Session,
    room_id: int,
    requester: Member,
    team_id: int | None,
    name: str | None,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
) -> tuple[Reservation, Room, Team | None]:
    """요청한 구간을 검증하고 예약 행 하나를 만들어, 합주실·팀과 함께 반환합니다.

    행은 아직 session 에 추가하지 않습니다. 추가할 시점과 commit 범위는 호출자가 정합니다.
    겹치는지는 여기서 보지 않습니다. 조회해서 확인하면 그 사이에 들어온 다른 요청을 놓치므로,
    판정을 commit 시점의 겹침 금지 제약 하나에 맡깁니다.
    """
    require_valid_slot_bounds(starts_at, ends_at, slot_minutes(session))
    require_same_day(starts_at, ends_at)
    room = _get_room_or_raise(session, room_id)
    require_within_room_hours(room.opens_at, room.closes_at, starts_at, ends_at)
    team = None
    if team_id is not None:
        team = _get_team_or_raise(session, team_id)
        _require_team_member(session, team_id, requester.id)
    _require_not_in_focused_period(session, starts_at.date())

    row = Reservation(
        room_id=room_id,
        team_id=team_id,
        member_id=requester.id,
        name=name,
        starts_at=starts_at,
        ends_at=ends_at,
        created_at=created_at,
    )
    return row, room, team


def create_reservation(
    session: Session,
    room_id: int,
    requester: Member,
    team_id: int | None,
    name: str | None,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
) -> tuple[Reservation, str, str, str | None]:
    """예약 한 건을 만듭니다. 그 시간이 이미 차 있으면 commit 이 겹침 금지 제약에 걸려 거절됩니다.

    검증 과정에서 이미 조회한 합주실·멤버·팀의 이름을 함께 반환하므로, 호출자가 이름을
    표시하려고 다시 조회할 필요가 없습니다.
    """
    row, room, team = _planned_row(
        session, room_id, requester, team_id, name, starts_at, ends_at, created_at
    )
    session.add(row)
    commit_translating(session, RESERVATION_MESSAGES)
    return row, room.name, requester.name, team.name if team is not None else None


def list_reservations(
    session: Session, room_id: int, from_date: date, to_date: date
) -> list[ReservationRow]:
    """room_id의 [from_date, to_date] 범위 예약을 시작 시각 순으로 반환합니다.

    각 행마다 합주실 이름·팀 이름(팀 예약이 아니면 None)·예약한 멤버 이름을 함께 포함합니다.
    """
    room = _get_room_or_raise(session, room_id)
    range_start = datetime.combine(from_date, time.min)
    range_end = datetime.combine(to_date, time.max)
    rows = session.execute(
        select(Reservation, Team.name, Member.name)
        .join(Member, Member.id == Reservation.member_id)
        .outerjoin(Team, Team.id == Reservation.team_id)
        .where(Reservation.room_id == room_id)
        .where(Reservation.cancelled_at.is_(None))
        .where(Reservation.starts_at >= range_start)
        .where(Reservation.starts_at <= range_end)
        .order_by(Reservation.starts_at)
    ).all()
    return [
        (reservation, room.name, team_name, member_name)
        for reservation, team_name, member_name in rows
    ]


def _get_own_reservation(
    session: Session, reservation_id: int, requester: Member, verb: str
) -> Reservation:
    """reservation_id 의 예약을 찾아, 그 예약을 한 멤버가 requester 일 때만 반환합니다.

    없는 예약과 취소된 예약은 ValueError, 다른 사용자의 예약은 PermissionError 로 구분하여 발생시킵니다. 호출자가
    "잘못된 요청"(422)과 "권한 없음"(403)을 다른 HTTP 상태 코드로 반환합니다. verb 는 오류 메시지에
    들어가는 동작 이름입니다("취소할", "옮길").

    행을 잠급니다(with_for_update). 잠그지 않으면 읽은 뒤 commit 하기 전에 reservation_manage
    권한자가 같은 예약을 취소할 수 있고, 그때 UPDATE 는 없는 행에 적용되어 0행을 고치고도
    성공으로 commit 됩니다. 옮기지 못한 예약을 옮겼다고 응답하게 됩니다.
    """
    reservation = session.scalars(
        select(Reservation)
        .where(Reservation.id == reservation_id, Reservation.cancelled_at.is_(None))
        .with_for_update()
    ).first()
    if reservation is None:
        raise ValueError("그런 예약이 없습니다")
    # reservation_manage 권한을 가진 멤버는 다른 사용자의 예약도 취소·이동할 수 있습니다. 이 권한이
    # 없으면 합주실 관리자가 다른 사용자의 예약을 취소할 방법이 없습니다.
    if reservation.member_id != requester.id and (
        "reservation_manage" not in account_permissions(session, requester.id)
    ):
        raise PermissionError(f"본인이 예약한 자리만 {verb} 수 있습니다")
    return reservation


def cancel_reservation(
    session: Session, reservation_id: int, requester: Member, cancelled_at: datetime
) -> None:
    """예약 한 건을 취소합니다. 예약한 멤버 본인 또는 reservation_manage 권한을 가진 멤버만 취소할 수 있습니다.

    행을 지우지 않고 cancelled_at 만 기록합니다. 취소된 행은 조회·이동·취소 대상에서 빠지고 겹침 금지
    제약도 보지 않으므로, 그 시간은 다시 예약할 수 있습니다.
    """
    _get_own_reservation(session, reservation_id, requester, "취소할").cancelled_at = cancelled_at
    session.commit()


def update_reservation(
    session: Session,
    reservation_id: int,
    requester: Member,
    starts_at: datetime,
    ends_at: datetime,
    moved_at: datetime,
) -> tuple[Reservation, str, str, str | None]:
    """예약 한 건을 다른 구간으로 옮깁니다. 합주실·팀·이름·처음 잡은 시각(created_at)은 그대로 둡니다.

    옛 행을 취소 표시(cancelled_at=moved_at)로 두고 새 행을 만들어, 옮긴 이력이 DB 에 남습니다.
    둘은 한 transaction 입니다. 옮길 자리가 이미 차 있으면 commit 이 겹침 금지 제약에 걸리고,
    rollback 이 옛 행의 취소 표시까지 되돌려 예약을 잃지 않습니다.

    원래 구간과 겹치는 이동도 됩니다. 제약이 취소된 행을 보지 않으므로 옛 행은 비교 대상이 아닙니다.
    """
    old = _get_own_reservation(session, reservation_id, requester, "옮길")
    room = _get_room_or_raise(session, old.room_id)

    require_valid_slot_bounds(starts_at, ends_at, slot_minutes(session))
    require_same_day(starts_at, ends_at)
    require_within_room_hours(room.opens_at, room.closes_at, starts_at, ends_at)
    _require_not_in_focused_period(session, starts_at.date())

    old.cancelled_at = moved_at
    # 옛 행의 취소 표시를 먼저 DB 에 보냅니다. 새 행의 INSERT 가 먼저 나가면 겹침 금지 제약이 아직
    # 취소되지 않은 옛 행과 비교해, 원래 구간과 겹치는 이동을 거절합니다.
    session.flush()
    moved = Reservation(
        room_id=old.room_id,
        team_id=old.team_id,
        member_id=old.member_id,
        name=old.name,
        starts_at=starts_at,
        ends_at=ends_at,
        created_at=old.created_at,
    )
    session.add(moved)
    commit_translating(session, RESERVATION_MESSAGES)

    team = None
    if moved.team_id is not None:
        team = session.get(Team, moved.team_id)
    return moved, room.name, requester.name, team.name if team is not None else None
