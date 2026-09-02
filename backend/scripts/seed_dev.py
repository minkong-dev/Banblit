"""개발용 시드 — 프로토타입 화면에 띄울 실제 데이터를 만든다.

기간을 둘 둔다. 앞 기간은 배정이 성사돼 시간표가 저장되므로 스케줄러 화면이
읽을 것이 생기고, 뒤 기간은 새벽 네시가 자리를 못 채워 조율안이 나오므로
배정 결과 화면이 보여줄 A안·B안이 생긴다.

명단은 프로토타입(frontend/prototypes/scheduler.html)과 같다. 이도현은 두 팀에
걸친 한 사람이고 김민서는 서로 다른 두 사람이다 — 사람을 번호로 가르는 규칙을
화면에서 눈으로 확인하려고 그대로 옮겼다.

    docker compose run --rm dev python scripts/seed_dev.py
    docker compose run --rm dev python scripts/seed_dev.py --reset
"""

import sys
from datetime import date, datetime, time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.api.period_service import assign_period
from backend.db.models import (
    Assignment,
    AssignmentBackup,
    Member,
    Membership,
    Period,
    Position,
    Room,
    Team,
    UnavailableTime,
)
from backend.db.pipeline import get_engine

POSITIONS = ["보컬", "기타", "드럼", "베이스", "키보드"]

# (팀 이름, [(사람 이름, 포지션)]) — 사람 이름이 겹쳐도 각각 다른 사람이다.
ROSTER: list[tuple[str, list[tuple[str, str]]]] = [
    ("새벽 네시", [("박서연", "보컬"), ("이도현", "기타"), ("김민서", "드럼"), ("최유진", "베이스")]),
    ("파랑주의보", [("정하람", "보컬"), ("김민서", "기타"), ("오세진", "드럼")]),
    ("오프비트", [("한지우", "보컬"), ("이도현", "베이스"), ("윤태오", "드럼"), ("서가온", "키보드")]),
    ("라스트 테이크", [("강예린", "보컬"), ("문시후", "기타"), ("백로운", "드럼")]),
]

# 이도현은 새벽 네시와 오프비트에 같은 사람으로 들어간다. 이름이 같은 나머지
# (김민서)는 팀마다 다른 사람이므로 여기 적지 않는다.
SHARED_MEMBERS = {("이도현", "새벽 네시"), ("이도현", "오프비트")}

ROOMS: list[tuple[str, time, time]] = [
    ("합주실 A", time(18, 0), time(22, 0)),
    ("합주실 B", time(19, 0), time(22, 0)),
]

FEASIBLE_PERIOD = (date(2026, 9, 14), date(2026, 9, 20))
BLOCKED_PERIOD = (date(2026, 9, 21), date(2026, 9, 27))

# 뒤 기간에서 새벽 네시를 막는 두 사람. 막는 날이 서로 달라서, 둘 중 누구
# 하나만 빠져도 나머지 날짜로 자리를 채울 수 있다 — 조율안이 둘 나온다.
BLOCKS: list[tuple[str, str, list[date]]] = [
    ("김민서", "새벽 네시", [date(2026, 9, 21), date(2026, 9, 22), date(2026, 9, 23)]),
    ("최유진", "새벽 네시", [date(2026, 9, 24), date(2026, 9, 25), date(2026, 9, 26)]),
]
BLOCK_HOURS = (time(18, 0), time(22, 0))


def clear(session: Session) -> None:
    """시드가 만든 것을 전부 지운다. 자식 표부터 지워 외래키를 건드리지 않는다.

    포지션은 마이그레이션이 넣은 기준 데이터라 시드 소관이 아니다 — 그대로 둔다.
    """
    for model in (
        AssignmentBackup,
        Assignment,
        UnavailableTime,
        Membership,
        Period,
        Room,
        Team,
        Member,
    ):
        session.execute(delete(model))
    session.commit()


def already_seeded(session: Session) -> bool:
    return session.scalar(select(Team).limit(1)) is not None


def load_positions(session: Session) -> dict[str, Position]:
    """포지션은 마이그레이션이 이미 넣어 두었다. 있는 것을 쓰고 빠진 것만 채운다."""
    positions = {
        position.name: position for position in session.scalars(select(Position))
    }
    missing = [name for name in POSITIONS if name not in positions]
    for name in missing:
        position = Position(name=name)
        session.add(position)
        positions[name] = position
    if missing:
        session.flush()
    return positions


def insert_roster(
    session: Session, positions: dict[str, Position]
) -> dict[str, Team]:
    """팀·사람·소속을 넣는다. 같은 이름이라도 SHARED_MEMBERS 에 없으면 다른 사람이다."""
    teams: dict[str, Team] = {}
    shared: dict[str, Member] = {}

    for team_name, members in ROSTER:
        team = Team(name=team_name)
        session.add(team)
        session.flush()
        teams[team_name] = team

        for member_name, position_name in members:
            if (member_name, team_name) in SHARED_MEMBERS and member_name in shared:
                member = shared[member_name]
            else:
                member = Member(name=member_name)
                session.add(member)
                session.flush()
                if (member_name, team_name) in SHARED_MEMBERS:
                    shared[member_name] = member

            session.add(
                Membership(
                    member_id=member.id,
                    team_id=team.id,
                    position_id=positions[position_name].id,
                )
            )
    session.flush()
    return teams


def insert_rooms(session: Session) -> list[Room]:
    rooms = [
        Room(name=name, opens_at=opens_at, closes_at=closes_at)
        for name, opens_at, closes_at in ROOMS
    ]
    session.add_all(rooms)
    session.flush()
    return rooms


def insert_period(session: Session, span: tuple[date, date]) -> Period:
    starts_on, ends_on = span
    period = Period(
        kind="focused",
        starts_on=starts_on,
        ends_on=ends_on,
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(18, 0),
    )
    session.add(period)
    session.flush()
    return period


def insert_blocks(session: Session, teams: dict[str, Team]) -> None:
    """조율안을 만들어내는 못 나오는 시간을 넣는다."""
    opens_at, closes_at = BLOCK_HOURS
    for member_name, team_name, days in BLOCKS:
        member_id = session.scalar(
            select(Membership.member_id)
            .join(Member, Member.id == Membership.member_id)
            .where(
                Membership.team_id == teams[team_name].id,
                Member.name == member_name,
            )
        )
        if member_id is None:
            raise RuntimeError(f"{team_name} 의 {member_name} 을 찾지 못했습니다")

        for day in days:
            session.add(
                UnavailableTime(
                    member_id=member_id,
                    starts_at=datetime.combine(day, opens_at),
                    ends_at=datetime.combine(day, closes_at),
                    repeats_weekly=False,
                )
            )
    session.flush()


def report(label: str, period: Period, session: Session, team_ids: list[int], room_ids: list[int]) -> None:
    """배정을 실제로 돌려보고 결과를 한 줄로 알린다."""
    result = assign_period(
        session, period.id, team_ids, room_ids, saved_at=datetime.now()
    )
    session.commit()

    state = "성사" if result.resolution.assignment.feasible else "불가"
    saved = "저장함" if result.saved else "저장 안 함"
    proposals = len(result.resolution.proposals)
    print(
        f"  {label} (기간 {period.id}: {period.starts_on}~{period.ends_on})"
        f" — 배정 {state}, {saved}, 조율안 {proposals}개"
    )
    for proposal in result.resolution.proposals:
        name = result.member_names[proposal.excluded_member]
        print(f"      · {name}(#{proposal.excluded_member}) 을 빼면 풀린다")


def main() -> int:
    reset = "--reset" in sys.argv[1:]

    with Session(get_engine()) as session:
        if already_seeded(session):
            if not reset:
                print("이미 데이터가 있습니다. 지우고 다시 넣으려면 --reset 을 붙이세요.")
                return 0
            print("기존 데이터를 지웁니다.")
            clear(session)

        positions = load_positions(session)
        teams = insert_roster(session, positions)
        rooms = insert_rooms(session)
        feasible = insert_period(session, FEASIBLE_PERIOD)
        blocked = insert_period(session, BLOCKED_PERIOD)
        insert_blocks(session, teams)
        session.commit()

        team_ids = [team.id for team in teams.values()]
        room_ids = [room.id for room in rooms]

        print(f"팀 {len(teams)}개, 합주실 {len(rooms)}개, 기간 2개를 넣었습니다.")
        report("스케줄러용", feasible, session, team_ids, room_ids)
        report("배정 화면용", blocked, session, team_ids, room_ids)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
