from datetime import date, datetime, time

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.api.input import (
    require_same_day,
    require_valid_slot_bounds,
    require_within_room_hours,
)
from backend.api.permission_service import account_permissions
from backend.db.models import Member, Period, Reservation, Room, Team, TeamSlot
from backend.db.pipeline import commit_translating
from backend.scheduling.pipeline import TimeInterval, generate_slots

# 선착순은 (room_id, starts_at) unique 제약이 commit 시점에 정합니다. 먼저 commit 한 요청이 그 slot(1시간 단위 시간 칸)을 가져갑니다.
RESERVATION_MESSAGES = {
    "reservations_room_id_starts_at_key": "이미 다른 사람이 예약한 시간입니다. 다른 시간을 골라 주세요",
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


def _planned_rows(
    session: Session,
    room_id: int,
    requester: Member,
    team_id: int | None,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
) -> tuple[list[Reservation], Room, Team | None]:
    """요청한 구간을 검증하고 1시간 단위 slot 행 목록을 생성하여, 합주실·팀과 함께 반환합니다.

    행은 아직 session 에 추가하지 않습니다. 추가할 시점과 commit 범위는 호출자가 정합니다.
    """
    require_valid_slot_bounds(starts_at, ends_at)
    require_same_day(starts_at, ends_at)
    room = _get_room_or_raise(session, room_id)
    require_within_room_hours(room.opens_at, room.closes_at, starts_at, ends_at)
    team = None
    if team_id is not None:
        team = _get_team_or_raise(session, team_id)
        _require_team_member(session, team_id, requester.id)
    _require_not_in_focused_period(session, starts_at.date())

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


def create_reservation(
    session: Session,
    room_id: int,
    requester: Member,
    team_id: int | None,
    starts_at: datetime,
    ends_at: datetime,
    created_at: datetime,
) -> tuple[list[Reservation], str, str, str | None]:
    """예약을 1시간 단위 slot 행으로 분할하여 생성합니다. slot 이 하나라도 이미 예약되어 있으면 전체를 rollback 합니다.

    선착순은 reservations table 의 (room_id, starts_at) unique 제약이 commit 시점에 정합니다.
    schedule_service.save_schedule 과 같은 방식입니다. 검증 과정에서 이미 조회한 합주실·멤버·팀의
    이름을 함께 반환하므로, 호출자가 이름을 표시하려고 다시 조회할 필요가 없습니다.
    """
    rows, room, team = _planned_rows(
        session, room_id, requester, team_id, starts_at, ends_at, created_at
    )
    session.add_all(rows)
    commit_translating(session, RESERVATION_MESSAGES)
    return rows, room.name, requester.name, team.name if team is not None else None


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
    """reservation_id의 slot을 찾아, 그 slot을 예약한 멤버가 requester일 때만 반환합니다.

    없는 slot 은 ValueError, 다른 사용자의 slot 은 PermissionError 로 구분하여 발생시킵니다. 호출자가
    "잘못된 요청"(422)과 "권한 없음"(403)을 다른 HTTP 상태 코드로 반환합니다. verb 는 오류 메시지에
    들어가는 동작 이름입니다("취소할", "옮길").
    """
    reservation = session.get(Reservation, reservation_id)
    if reservation is None:
        raise ValueError("그런 예약이 없습니다")
    # reservation_manage 권한을 가진 멤버는 다른 사용자의 예약도 취소·이동할 수 있습니다. 이 권한이
    # 없으면 합주실 관리자가 다른 사용자의 예약을 취소할 방법이 없습니다.
    if reservation.member_id != requester.id and (
        "reservation_manage" not in account_permissions(session, requester.id)
    ):
        raise PermissionError(f"본인이 예약한 자리만 {verb} 수 있습니다")
    return reservation


def cancel_reservation(session: Session, reservation_id: int, requester: Member) -> None:
    """예약 slot 하나를 취소합니다. 그 slot 을 예약한 멤버 본인 또는 reservation_manage 권한을 가진 멤버만 삭제할 수 있습니다.

    ponytail: 여러 slot 을 이어서 예약하면 각 slot 마다 id 가 다르므로, 화면(DayDialog 의 삭제 버튼 →
    pipeline.ts cancelBooking)이 각 slot 마다 이 endpoint 를 순차적으로 호출합니다. 중간에 하나가
    실패하면 실패한 slot 앞의 slot 만 삭제되고 나머지는 남습니다. "예약 하나를 통째로 취소"가 한 번의
    요청이어야 하면 그때 예약을 묶는 ID 를 추가합니다.
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
    """예약 slot 하나를 다른 시각으로 이동합니다. 합주실과 팀은 그대로 두고 시각만 변경합니다.

    기존 slot 을 삭제하고 새 slot 을 추가하는 작업을 한 transaction 에서 수행합니다. 이동할 slot 이 이미
    예약되어 있으면 commit 이 unique 제약에 실패하고, rollback 이 기존 slot 까지 함께 복구하여 원래 예약을
    잃지 않습니다. 삭제를 먼저 flush 하는 이유는 SQLAlchemy 가 기본적으로 INSERT 를 DELETE 보다 먼저
    전송하기 때문입니다. flush 하지 않으면 같은 slot 이나 인접한 slot 으로 이동할 때 자기 자신과 충돌합니다.

    ponytail: cancel_reservation 과 같은 한계로, 이동 단위는 slot 하나입니다. 여러 slot 을
    이어서 예약한 경우를 통째로 이동하려면 각 slot 마다 이 endpoint 를 호출해야 합니다. 새
    구간이 여러 slot 이면 create_reservation 과 같은 규칙으로 분할되어 slot 개수가 증가합니다.
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
    commit_translating(session, RESERVATION_MESSAGES)
    return rows, room.name, requester.name, team.name if team is not None else None
