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

from backend.api.auth_service import signup as create_account
from backend.api.period_service import assign_period
from backend.api.reservation_service import create_reservation
from backend.db.models import (
    Assignment,
    AssignmentBackup,
    Comment,
    Member,
    Membership,
    Period,
    Position,
    Post,
    Reservation,
    Room,
    Team,
    UnavailableTime,
)
from backend.db.pipeline import get_engine

POSITIONS = ["보컬", "기타", "드럼", "베이스", "키보드"]

# E2E(frontend/e2e/)가 로그인해 쓰는 계정. 맨 처음 만드는 계정이라 헤드매니저가
# 되고(공지 작성 검사), 새벽 네시에 편입해 팀 게시판 권한도 함께 검사할 수 있게 한다.
E2E_ACCOUNT_EMAIL = "e2e@banblit.test"
E2E_ACCOUNT_PASSWORD = "e2e-password1"
E2E_ACCOUNT_TEAM = "새벽 네시"

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
# FEASIBLE_PERIOD보다 앞선, 겹치지 않는 상시 개방기간 — 예약은 이 기간 안에서만 받는다.
OPEN_PERIOD = (date(2026, 9, 7), date(2026, 9, 13))
OPEN_DAY = date(2026, 9, 8)

# 스케줄러 "내 일정" 탭에서 눈으로 확인할 못 나오는 시간. BLOCKS(조율안 유도용)와
# 달리 화면 확인만이 목적이라 배정에 영향이 없는 열린 기간 안의 날짜를 쓴다.
UNAVAILABLE_EXAMPLES: list[tuple[str, str, date, time, time]] = [
    ("이도현", "새벽 네시", OPEN_DAY, time(20, 0), time(21, 0)),
]

# 스케줄러 "예약" 탭에서 눈으로 확인할 예약. 개인 예약 하나, 팀 예약 하나를 둔다.
RESERVATION_EXAMPLES: list[tuple[str, str | None, time, time]] = [
    ("이도현", None, time(18, 0), time(19, 0)),
    ("박서연", "새벽 네시", time(19, 30), time(20, 30)),
]

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
        Reservation,
        UnavailableTime,
        Comment,
        Post,
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


def insert_e2e_account(session: Session, teams: dict[str, Team]) -> None:
    account = create_account(
        session, "E2E 계정", E2E_ACCOUNT_EMAIL, E2E_ACCOUNT_PASSWORD, ["보컬"]
    )
    position_id = session.scalar(select(Position.id).where(Position.name == "보컬"))
    session.add(
        Membership(
            member_id=account.id,
            team_id=teams[E2E_ACCOUNT_TEAM].id,
            position_id=position_id,
        )
    )
    session.commit()


def insert_rooms(session: Session) -> list[Room]:
    rooms = [
        Room(name=name, opens_at=opens_at, closes_at=closes_at)
        for name, opens_at, closes_at in ROOMS
    ]
    session.add_all(rooms)
    session.flush()
    return rooms


def insert_period(session: Session, span: tuple[date, date], kind: str = "focused") -> Period:
    starts_on, ends_on = span
    period = Period(
        kind=kind,
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


def insert_unavailable_examples(session: Session, teams: dict[str, Team]) -> None:
    """스케줄러 "내 일정" 탭에서 실제로 눈에 보이도록 못 나오는 시간을 몇 개 넣는다."""
    for member_name, team_name, day, starts_at, ends_at in UNAVAILABLE_EXAMPLES:
        member_id = _member_id(session, teams, team_name, member_name)
        session.add(
            UnavailableTime(
                member_id=member_id,
                starts_at=datetime.combine(day, starts_at),
                ends_at=datetime.combine(day, ends_at),
                repeats_weekly=False,
            )
        )
    session.flush()


def insert_reservation_examples(
    session: Session, teams: dict[str, Team], room: Room
) -> None:
    """스케줄러 "예약" 탭에서 실제로 눈에 보이도록 상시 개방기간 예약을 몇 개 넣는다.

    create_reservation을 그대로 불러 화면과 같은 검증(30분 격자·운영 시간·상시
    개방기간)을 통과한 값만 들어가게 한다.
    """
    for member_name, team_name, starts_at, ends_at in RESERVATION_EXAMPLES:
        member_id = _member_id(session, teams, "새벽 네시", member_name)
        team_id = teams[team_name].id if team_name is not None else None
        create_reservation(
            session,
            room.id,
            member_id,
            team_id,
            datetime.combine(OPEN_DAY, starts_at),
            datetime.combine(OPEN_DAY, ends_at),
            datetime.now(),
        )


def _member_id(session: Session, teams: dict[str, Team], team_name: str, member_name: str) -> int:
    result = session.scalar(
        select(Membership.member_id)
        .join(Member, Member.id == Membership.member_id)
        .where(
            Membership.team_id == teams[team_name].id, Member.name == member_name
        )
    )
    if result is None:
        raise RuntimeError(f"{team_name} 의 {member_name} 을 찾지 못했습니다")
    return result


def insert_boards(session: Session, teams: dict[str, Team]) -> None:
    """공지 둘, 팀 게시판 글 하나, 댓글 몇 개를 넣어 게시판 화면을 눈으로 확인하게 한다."""
    head = _member_id(session, teams, "새벽 네시", "박서연")
    now = datetime.now()

    notice = Post(
        team_id=None,
        title="9월 합주실 예약 안내",
        body="이번 달부터 합주실 예약은 전주 금요일 정오에 열립니다.",
        author_id=head,
        created_at=now,
    )
    session.add(notice)
    session.flush()
    session.add(
        Comment(
            post_id=notice.id,
            body="확인했습니다.",
            author_id=_member_id(session, teams, "파랑주의보", "정하람"),
            created_at=now,
        )
    )

    session.add(
        Post(
            team_id=None,
            title="정기 점검 안내",
            body="다음 주 화요일 오전에 시스템 점검이 있습니다.",
            author_id=head,
            created_at=now,
        )
    )

    team_post = Post(
        team_id=teams["새벽 네시"].id,
        title="이번 주 합주 곡 정하기",
        body="다음 합주 때 연주할 곡을 댓글로 골라 주세요.",
        author_id=head,
        created_at=now,
    )
    session.add(team_post)
    session.flush()
    session.add(
        Comment(
            post_id=team_post.id,
            body="지난 앨범 타이틀 곡 어떨까요.",
            author_id=_member_id(session, teams, "새벽 네시", "이도현"),
            created_at=now,
        )
    )
    session.add(
        Comment(
            post_id=team_post.id,
            body="좋습니다.",
            author_id=_member_id(session, teams, "새벽 네시", "김민서"),
            created_at=now,
        )
    )

    # 댓글 없는 팀 게시판 글도 하나 둔다 — 댓글이 아직 안 달린 화면을 눈으로 볼 수 있게.
    session.add(
        Post(
            team_id=teams["새벽 네시"].id,
            title="새 마이크 구매 문의",
            body="다음 합주 전까지 보컬 마이크를 새로 사도 될까요.",
            author_id=_member_id(session, teams, "새벽 네시", "최유진"),
            created_at=now,
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
        insert_e2e_account(session, teams)
        rooms = insert_rooms(session)
        feasible = insert_period(session, FEASIBLE_PERIOD)
        blocked = insert_period(session, BLOCKED_PERIOD)
        insert_period(session, OPEN_PERIOD, kind="open")
        insert_blocks(session, teams)
        insert_unavailable_examples(session, teams)
        insert_reservation_examples(session, teams, rooms[0])
        insert_boards(session, teams)
        session.commit()

        team_ids = [team.id for team in teams.values()]
        room_ids = [room.id for room in rooms]

        print(f"팀 {len(teams)}개, 합주실 {len(rooms)}개, 기간 3개(집중 2·상시 1)를 넣었습니다.")
        print(f"못 나오는 시간 예시 {len(UNAVAILABLE_EXAMPLES)}개, 예약 예시 {len(RESERVATION_EXAMPLES)}개를 넣었습니다.")
        print("공지 2개, 팀 게시판 글 2개, 댓글 3개를 넣었습니다.")
        print(f"E2E 계정: {E2E_ACCOUNT_EMAIL} / {E2E_ACCOUNT_PASSWORD} (헤드매니저, {E2E_ACCOUNT_TEAM} 소속)")
        report("스케줄러용", feasible, session, team_ids, room_ids)
        report("배정 화면용", blocked, session, team_ids, room_ids)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
