from dataclasses import dataclass
from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.period_input import (
    auto_slots_per_team,
    build_engine_rooms,
    build_engine_teams,
    dates_in_period,
    expand_unavailable,
)
from backend.db.models import (
    Assignment,
    Member,
    TeamSlot,
    Period,
    Room,
    Team,
    UnavailableTime,
)
from backend.db.pipeline import AssignmentRow, save_schedule
from backend.scheduling.pipeline import Assignment as EngineAssignment
from backend.scheduling.pipeline import (
    Resolution,
    TimeInterval,
    generate_slots,
    resolve,
)


@dataclass(frozen=True)
class PeriodAssignResult:
    """배정 결과와, 엔진이 쓴 번호를 화면에 보일 이름으로 옮길 대응표."""

    resolution: Resolution
    saved: bool
    team_names: dict[int, str]
    room_names: dict[int, str]
    member_names: dict[int, str]


@dataclass(frozen=True)
class OpenSlot:
    """아무 팀도 배정받지 않은 30분 slot 하나. 방 번호와 이름을 함께 들고 있다."""

    room_id: int
    room: str
    start: datetime
    end: datetime


def assign_period(
    session: Session,
    period_id: int,
    team_ids: list[int],
    room_ids: list[int],
    saved_at: datetime,
    excluded_member_id: int | None = None,
) -> PeriodAssignResult:
    """기간 전체의 시간표를 짜고, 성공하면 현행 시간표로 저장한다.

    배정이 불가능하면 저장하지 않고 조율안만 담아 돌려준다 — 실패는 오류가 아니다.
    excluded_member_id 를 주면 그 사람을 명단에서 빼고 계산한다. 조율안 확정이
    이 인자를 쓴다 — 조율안이 지목한 사람을 빼면 조율안과 같은 계산이 된다.
    잘못된 입력(없는 기간·팀·합주실, 상시기간, 명단 밖 사람)은 ValueError로 거부한다.
    """
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("그런 기간이 없습니다")
    if period.kind != "focused":
        raise ValueError("집중 합주기간에서만 자동 배정을 실행할 수 있습니다")
    if len(team_ids) != len(set(team_ids)):
        raise ValueError("팀 id가 중복되었습니다")
    if len(room_ids) != len(set(room_ids)):
        raise ValueError("합주실 id가 중복되었습니다")

    rooms = _load_rooms(session, room_ids)
    team_names = _load_team_names(session, team_ids)
    member_ids_by_team, member_names = _load_members(session, team_ids)
    if excluded_member_id is not None:
        member_ids_by_team = _without_member(member_ids_by_team, excluded_member_id)

    days = dates_in_period(period.starts_on, period.ends_on)
    window_start = datetime.combine(period.starts_on, time())
    window_end = datetime.combine(period.ends_on, time.max)
    unavailable_by_member = _load_unavailable(
        session, list(member_names), window_start, window_end
    )

    engine_rooms = build_engine_rooms(rooms, days)
    slots_per_team = auto_slots_per_team(engine_rooms, len(team_ids))
    engine_teams = build_engine_teams(
        team_ids, member_ids_by_team, unavailable_by_member
    )

    resolution = resolve(engine_teams, engine_rooms, slots_per_team)

    saved = False
    if resolution.assignment.feasible:
        save_schedule(
            session,
            period_id,
            _assignment_rows(resolution.assignment),
            saved_at=saved_at,
        )
        saved = True

    return PeriodAssignResult(
        resolution=resolution,
        saved=saved,
        team_names=team_names,
        room_names={room.id: room.name for room in rooms},
        member_names=member_names,
    )


def _load_rooms(session: Session, room_ids: list[int]) -> list[Room]:
    rooms = session.scalars(select(Room).where(Room.id.in_(room_ids))).all()
    missing = set(room_ids) - {room.id for room in rooms}
    if missing:
        raise ValueError(
            f"그런 합주실이 없습니다: {', '.join(str(i) for i in sorted(missing))}"
        )
    return list(rooms)


def _load_team_names(session: Session, team_ids: list[int]) -> dict[int, str]:
    rows = session.execute(
        select(Team.id, Team.name).where(Team.id.in_(team_ids))
    ).all()
    names = {row[0]: row[1] for row in rows}
    missing = set(team_ids) - set(names)
    if missing:
        raise ValueError(
            f"그런 팀이 없습니다: {', '.join(str(i) for i in sorted(missing))}"
        )
    return names


def _load_members(
    session: Session, team_ids: list[int]
) -> tuple[dict[int, list[int]], dict[int, str]]:
    # 팀별 멤버 번호 목록과, 번호에서 이름을 찾을 대응표를 함께 돌려준다.
    # 엔진에는 번호만 가고, 이름은 응답을 만들 때만 쓴다.
    # 사람이 앉지 않은 자리는 배정 명단에 넣지 않는다 — 안쪽 조인이 빈 자리를 거른다.
    rows = session.execute(
        select(TeamSlot.team_id, Member.id, Member.name)
        .join(Member, Member.id == TeamSlot.member_id)
        .where(TeamSlot.team_id.in_(team_ids))
        .order_by(TeamSlot.team_id, Member.id)
    ).all()
    member_ids_by_team: dict[int, list[int]] = {}
    member_names: dict[int, str] = {}
    for team_id, member_id, member_name in rows:
        member_ids_by_team.setdefault(team_id, []).append(member_id)
        member_names[member_id] = member_name
    return member_ids_by_team, member_names


def _without_member(
    member_ids_by_team: dict[int, list[int]], excluded_member_id: int
) -> dict[int, list[int]]:
    # excluded_member_id 를 뺀 명단을 새로 만들어 돌려준다. 원본은 고치지 않는다.
    # 어느 팀에도 없는 번호면 조율안이 가리킬 수 없는 사람이므로 여기서 거부한다.
    in_some_team = any(
        excluded_member_id in member_ids for member_ids in member_ids_by_team.values()
    )
    if not in_some_team:
        raise ValueError(f"{excluded_member_id}번은 이 팀들의 명단에 없습니다")
    return {
        team_id: [i for i in member_ids if i != excluded_member_id]
        for team_id, member_ids in member_ids_by_team.items()
    }


def open_slots_in_period(session: Session, period: Period) -> list[OpenSlot]:
    """그 기간에서 아무 팀도 쓰지 않는 30분 slot 을 시작 시각순으로 돌려준다.

    저장된 배정에 쓰인 합주실의 운영시간을 기간의 날짜마다 slot 으로 쪼갠 뒤,
    배정이 차지한 slot 을 뺀다. 배정 계산(resolve)은 여기서 실행하지 않는다.
    합주실 운영시간이 30분 slot 으로 쪼개지지 않으면 ValueError를 올린다.
    """
    # ponytail: slot 을 만들 합주실을 저장된 배정에서 되찾는다 — 배정에 넘긴 합주실
    # 목록을 남기는 table 이 없어서다. 한 slot 도 못 받은 합주실은 남는 slot 에도 안 나온다.
    # period_rooms table 이 생기면 여기서 그 목록을 읽는다.
    taken = session.execute(
        select(Assignment.room_id, Assignment.starts_at).where(
            Assignment.period_id == period.id
        )
    ).all()
    if not taken:
        return []

    occupied = {(room_id, starts_at) for room_id, starts_at in taken}
    rooms = session.scalars(
        select(Room).where(Room.id.in_({room_id for room_id, _ in taken}))
    ).all()
    room_names = {room.id: room.name for room in rooms}

    days = dates_in_period(period.starts_on, period.ends_on)
    open_slots: list[OpenSlot] = []
    for engine_room in build_engine_rooms(list(rooms), days):
        for interval in generate_slots(engine_room.open_period):
            if (engine_room.id, interval.start) in occupied:
                continue
            open_slots.append(
                OpenSlot(
                    room_id=engine_room.id,
                    room=room_names[engine_room.id],
                    start=interval.start,
                    end=interval.end,
                )
            )
    open_slots.sort(key=lambda slot: (slot.start, slot.room))
    return open_slots


def _load_unavailable(
    session: Session,
    member_ids: list[int],
    window_start: datetime,
    window_end: datetime,
) -> dict[int, list[TimeInterval]]:
    if not member_ids:
        return {}
    rows = session.scalars(
        select(UnavailableTime).where(UnavailableTime.member_id.in_(member_ids))
    ).all()
    by_member: dict[int, list[UnavailableTime]] = {}
    for row in rows:
        by_member.setdefault(row.member_id, []).append(row)
    return {
        member_id: expand_unavailable(member_rows, window_start, window_end)
        for member_id, member_rows in by_member.items()
    }


def _assignment_rows(assignment: EngineAssignment) -> list[AssignmentRow]:
    # 엔진이 돌려준 slot 을 그대로 저장할 줄로 옮긴다. 팀 번호도 방 번호도
    # DB 의 번호 그대로라 되돌릴 것이 없다.
    rows: list[AssignmentRow] = []
    for team_id, slots in assignment.slots_by_team.items():
        for room_slot in slots:
            rows.append(
                {
                    "team_id": team_id,
                    "room_id": room_slot.room_id,
                    "starts_at": room_slot.interval.start,
                    "ends_at": room_slot.interval.end,
                }
            )
    return rows
