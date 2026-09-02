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
    Member,
    Membership,
    Period,
    Room,
    Team,
    UnavailableTime,
)
from backend.db.schedule_store import AssignmentRow, save_schedule
from backend.scheduling.assignment import Assignment as EngineAssignment
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import Resolution, resolve


@dataclass(frozen=True)
class PeriodAssignResult:
    """배정 결과와, 엔진이 쓴 번호를 화면에 보일 이름으로 옮길 대응표."""

    resolution: Resolution
    saved: bool
    team_names: dict[int, str]
    room_names: dict[int, str]
    member_names: dict[int, str]


def assign_period(
    session: Session,
    period_id: int,
    team_ids: list[int],
    room_ids: list[int],
    saved_at: datetime,
) -> PeriodAssignResult:
    """기간 전체의 시간표를 짜고, 성공하면 현행 시간표로 저장한다.

    배정이 불가능하면 저장하지 않고 조율안만 담아 돌려준다 — 실패는 오류가 아니다.
    잘못된 입력(없는 기간·팀·합주실, 상시기간)은 ValueError로 거부한다.
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
    # 엔진에는 번호만 가고, 이름은 답장을 만들 때만 쓴다.
    rows = session.execute(
        select(Membership.team_id, Member.id, Member.name)
        .join(Member, Member.id == Membership.member_id)
        .where(Membership.team_id.in_(team_ids))
        .order_by(Membership.team_id, Member.id)
    ).all()
    member_ids_by_team: dict[int, list[int]] = {}
    member_names: dict[int, str] = {}
    for team_id, member_id, member_name in rows:
        member_ids_by_team.setdefault(team_id, []).append(member_id)
        member_names[member_id] = member_name
    return member_ids_by_team, member_names


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
    # 엔진이 돌려준 칸을 그대로 저장할 줄로 옮긴다. 팀 번호도 방 번호도
    # 저장소의 번호 그대로라 되돌릴 것이 없다.
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
