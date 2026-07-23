from dataclasses import dataclass
from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
from backend.db.schedule_store import save_schedule
from backend.scheduling.assignment import Assignment as EngineAssignment
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import Resolution, resolve


# assignments 테이블의 (room_id, starts_at) 유니크 제약 이름. 컨테이너 안에서
# 직접 충돌을 재현해 psycopg 예외의 orig.diag.constraint_name으로 관찰했다.
_ROOM_TIME_CONFLICT_CONSTRAINT = "assignments_room_id_starts_at_key"


def conflict_message_for(error: IntegrityError) -> str | None:
    """IntegrityError가 (room_id, starts_at) 유니크 위반일 때만 사용자용 문장을 돌려준다.

    다른 원인(외래키 위반 등)이면 None을 돌려줘, 호출자가 원래 예외를 그대로
    다시 올리게 한다 — 원인이 다른 사고에 같은 설명을 붙이면 사용자가 엉뚱한
    곳을 찾게 된다.

    관찰(컨테이너 안에서 직접 재현, 2026-07-23):
    - "다른 기간이 같은 방·시각을 쓰는 경우"와 "같은 기간을 동시에 두 번 저장하는
      경우" 모두 psycopg.errors.UniqueViolation이고 diag.constraint_name이
      "assignments_room_id_starts_at_key"로 완전히 동일했다. DB에 남는 정보만으로는
      이 둘을 구분할 수 없어, 문구가 두 경우를 모두 아우르게 썼다.
    - 팀·합주실이 저장 직전에 삭제된 경우는 psycopg.errors.ForeignKeyViolation이고
      constraint_name이 "assignments_team_id_fkey"/"assignments_room_id_fkey"였다.
    - 시간 역전(ends_at <= starts_at)은 psycopg.errors.CheckViolation,
      constraint_name이 "assignments_check"였다.
    """
    orig = error.orig
    diag = getattr(orig, "diag", None)
    constraint_name = getattr(diag, "constraint_name", None)
    if constraint_name != _ROOM_TIME_CONFLICT_CONSTRAINT:
        return None
    return (
        "다른 기간이거나 같은 기간의 동시 실행이 이미 같은 합주실의 같은 시간을 "
        "쓰고 있습니다. 기간이 겹치지 않게 하거나 합주실을 나누십시오"
    )


@dataclass(frozen=True)
class PeriodAssignResult:
    """배정 결과와, 엔진이 쓴 이름을 실제 id·이름으로 되돌릴 대응표."""

    resolution: Resolution
    saved: bool
    room_name_by_key: dict[str, str]
    room_id_by_key: dict[str, int]
    member_by_key: dict[str, tuple[int, str]]


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
    teams = _load_teams(session, team_ids)
    members_by_team = _load_members_by_team(session, team_ids)

    days = dates_in_period(period.starts_on, period.ends_on)
    window_start = datetime.combine(period.starts_on, time())
    window_end = datetime.combine(period.ends_on, time.max)

    member_ids = [
        member_id
        for members in members_by_team.values()
        for member_id, _ in members
    ]
    unavailable_by_member = _load_unavailable(
        session, member_ids, window_start, window_end
    )

    engine_rooms, room_id_by_key, room_name_by_key = build_engine_rooms(rooms, days)
    slots_per_team = auto_slots_per_team(engine_rooms, len(teams))
    engine_teams, team_id_by_name, member_by_key = build_engine_teams(
        teams, members_by_team, unavailable_by_member
    )

    resolution = resolve(engine_teams, engine_rooms, slots_per_team)

    saved = False
    if resolution.assignment.feasible:
        try:
            save_schedule(
                session,
                period_id,
                _assignment_rows(
                    resolution.assignment, team_id_by_name, room_id_by_key
                ),
                saved_at=saved_at,
            )
            session.commit()
        except IntegrityError as error:
            session.rollback()
            message = conflict_message_for(error)
            if message is None:
                raise
            raise ValueError(message) from error
        saved = True

    return PeriodAssignResult(
        resolution=resolution,
        saved=saved,
        room_name_by_key=room_name_by_key,
        room_id_by_key=room_id_by_key,
        member_by_key=member_by_key,
    )


def _load_rooms(session: Session, room_ids: list[int]) -> list[Room]:
    rooms = session.scalars(select(Room).where(Room.id.in_(room_ids))).all()
    missing = set(room_ids) - {room.id for room in rooms}
    if missing:
        raise ValueError(
            f"그런 합주실이 없습니다: {', '.join(str(i) for i in sorted(missing))}"
        )
    return list(rooms)


def _load_teams(session: Session, team_ids: list[int]) -> list[tuple[int, str]]:
    rows = session.execute(
        select(Team.id, Team.name).where(Team.id.in_(team_ids))
    ).all()
    missing = set(team_ids) - {row[0] for row in rows}
    if missing:
        raise ValueError(
            f"그런 팀이 없습니다: {', '.join(str(i) for i in sorted(missing))}"
        )
    return [(row[0], row[1]) for row in rows]


def _load_members_by_team(
    session: Session, team_ids: list[int]
) -> dict[int, list[tuple[int, str]]]:
    rows = session.execute(
        select(Membership.team_id, Member.id, Member.name)
        .join(Member, Member.id == Membership.member_id)
        .where(Membership.team_id.in_(team_ids))
        .order_by(Membership.team_id, Member.id)
    ).all()
    members_by_team: dict[int, list[tuple[int, str]]] = {}
    for team_id, member_id, member_name in rows:
        members_by_team.setdefault(team_id, []).append((member_id, member_name))
    return members_by_team


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


def _assignment_rows(
    assignment: EngineAssignment,
    team_id_by_name: dict[str, int],
    room_id_by_key: dict[str, int],
) -> list[dict]:
    rows: list[dict] = []
    for team_name, slots in assignment.slots_by_team.items():
        for room_slot in slots:
            rows.append(
                {
                    "team_id": team_id_by_name[team_name],
                    "room_id": room_id_by_key[room_slot.room],
                    "starts_at": room_slot.interval.start,
                    "ends_at": room_slot.interval.end,
                }
            )
    return rows
