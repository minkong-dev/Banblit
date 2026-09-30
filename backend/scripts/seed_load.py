"""배정 계산을 실제 규모로 확인하기 위한 개발용 예시 데이터를 넣습니다.

사람 40명, 팀 12개, 합주실 2개, 사람마다 고정(매주 반복)·일회성 불가능 일정, 예약 몇 건을 넣습니다.
집중 합주기간과 배정 계산은 넣지 않습니다 — 화면의 설정·스케줄링 버튼으로 직접 만듭니다.

이미 가입한 계정(관리자)은 그대로 두고 두 팀에 넣습니다. 팀이 하나라도 있으면 아무것도 넣지 않습니다.
값은 고정된 seed 로 만들어, 다시 넣어도 같은 데이터가 나옵니다.

실행:
    docker compose run --rm dev python scripts/seed_load.py
"""

import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Member, Reservation, Room, Team, TeamSlot, UnavailableTime
from backend.db.pipeline import get_engine
from backend.services.auth.pipeline import hash_password

PASSWORD = "Banblit123!"
PEOPLE = 40
# 일회성 불가능 일정을 흩어 넣는 날짜 범위(내일부터)와 예약을 넣는 날짜입니다.
SPREAD_DAYS = 14
RESERVE_FROM_DAYS = 8

SURNAMES = "김이박최정강조윤장임한오서신권황안송류홍"
GIVEN = ["민준", "서연", "도윤", "하은", "지호", "수아", "예준", "지우", "시우", "서윤", "주원", "하린",
         "지민", "채원", "현우", "다은", "건우", "소율", "우진", "예린", "선우", "유나", "연우", "가은"]
DEPARTMENTS = ["컴퓨터공학과", "경영학과", "실용음악과", "기계공학과", "국어국문학과", "심리학과", "디자인학과", "경제학과"]
TEAM_NAMES = ["청산", "불꽃놀이", "알루미늄", "곰팡이", "산책", "나침반", "우산을 들어줄게", "사포닌 같은 너",
              "새벽 네시", "파랑주의보", "antifreeze", "bad"]
# 팀 구성의 후보입니다. (포지션, 자리 번호). 팀마다 이 중 하나를 고릅니다.
LINEUPS = [
    [("보컬", 1), ("일렉", 1), ("일렉", 2), ("베이스", 1), ("드럼", 1)],
    [("보컬", 1), ("일렉", 1), ("베이스", 1), ("드럼", 1), ("신디", 1)],
    [("보컬", 1), ("일렉", 1), ("일렉", 2), ("베이스", 1), ("드럼", 1), ("신디", 1)],
    [("보컬", 1), ("통기타", 1), ("베이스", 1), ("드럼", 1)],
]
# 매주 반복하는 불가능 일정의 후보입니다. (이름, 시작 시, 끝 시). 수업·아르바이트처럼 매주 같은 시간대입니다.
FIXED = [("전공 수업", 13, 18), ("아르바이트", 18, 22), ("스터디", 19, 21), ("교양 수업", 15, 17), ("동아리 회의", 17, 19)]
# 하루만 있는 불가능 일정의 후보입니다.
ONCE = [("가족 모임", 17, 21), ("병원", 14, 16), ("과제 마감", 18, 23), ("면접", 16, 18), ("약속", 19, 22)]


def at(day: date, hour: int) -> datetime:
    return datetime.combine(day, time(hour))


def make_members(rng: random.Random, session: Session) -> list[Member]:
    members = []
    for index in range(1, PEOPLE + 1):
        member = Member(
            name=rng.choice(SURNAMES) + rng.choice(GIVEN),
            department=rng.choice(DEPARTMENTS),
            student_no=f"2026{index:04d}",
            cohort=rng.randint(44, 50),
            email=f"load{index:02d}@banblit.test",
            login_id=f"load{index:02d}",
            password_hash=hash_password(PASSWORD),
        )
        session.add(member)
        members.append(member)
    session.flush()
    return members


def make_teams(rng: random.Random, session: Session, people: list[Member], admin: Member) -> list[Team]:
    """자리마다 사람을 고릅니다. 한 사람이 여러 팀에 들어가는 경우가 섞이도록 전원을 한 번씩 배치한 뒤
    남는 자리는 무작위로 채웁니다. 같은 팀에 같은 사람이 두 번 들어가지 않습니다."""
    teams = []
    queue = people[:]
    rng.shuffle(queue)
    for index, name in enumerate(TEAM_NAMES):
        team = Team(name=name)
        session.add(team)
        session.flush()
        taken: set[int] = set()
        for position, (instrument, ordinal) in enumerate(rng.choice(LINEUPS)):
            # 관리자 계정은 앞의 두 팀 보컬에 넣어 "내 팀" 화면을 확인할 수 있게 합니다.
            if index < 2 and position == 0:
                who = admin
            else:
                who = queue.pop() if queue else rng.choice(people)
                while who.id in taken:
                    who = rng.choice(people)
            taken.add(who.id)
            session.add(TeamSlot(team_id=team.id, instrument=instrument, ordinal=ordinal, member_id=who.id))
        teams.append(team)
    session.flush()
    return teams


def make_unavailable(rng: random.Random, session: Session, people: list[Member], start: date) -> None:
    """사람마다 고정 1~2개(매주 1~2개 요일, 끝 없음)와 일회성 0~2개(내일부터 SPREAD_DAYS 일 안의 하루)를 넣습니다."""
    for member in people:
        for name, first, last in rng.sample(FIXED, rng.randint(1, 2)):
            days = rng.sample(range(7), rng.randint(1, 2))
            session.add(UnavailableTime(
                member_id=member.id, name=name,
                starts_at=at(start, first), ends_at=at(start, last),
                repeat_weekdays=sum(1 << day for day in days),
            ))
        for name, first, last in rng.sample(ONCE, rng.randint(0, 2)):
            day = start + timedelta(days=rng.randrange(SPREAD_DAYS))
            session.add(UnavailableTime(member_id=member.id, name=name, starts_at=at(day, first), ends_at=at(day, last)))


def make_reservations(rng: random.Random, session: Session, rooms: list[Room], teams: list[Team],
                      people: list[Member], after: date) -> None:
    """after 부터 5일 안에 넣습니다. 같은 합주실의 시간이 겹치지 않도록 합주실·날짜마다 시각을 한 번씩만 씁니다."""
    now = datetime.now().replace(microsecond=0)
    used: set[tuple[int, date, int]] = set()
    for count in range(8):
        room = rooms[count % len(rooms)]
        day = after + timedelta(days=rng.randrange(5))
        hour = rng.randrange(room.opens_at.hour, room.closes_at.hour - 1)
        if (room.id, day, hour) in used or (room.id, day, hour + 1) in used:
            continue
        used.update({(room.id, day, hour), (room.id, day, hour + 1)})
        team = rng.choice(teams) if count % 2 == 0 else None
        session.add(Reservation(
            room_id=room.id, team_id=team.id if team else None, member_id=rng.choice(people).id,
            starts_at=at(day, hour), ends_at=at(day, hour + 2), created_at=now,
        ))


def main() -> None:
    rng = random.Random(20260928)
    with Session(get_engine()) as session:
        if session.scalar(select(Team.id)) is not None:
            print("이미 팀이 있습니다. 개발 DB 를 비운 뒤 다시 실행하세요.")
            return
        admin = session.scalars(select(Member).order_by(Member.id)).first()
        if admin is None:
            print("가입한 계정이 없습니다. 관리자로 먼저 가입한 뒤 실행하세요.")
            return

        people = make_members(rng, session)
        teams = make_teams(rng, session, people, admin)
        rooms = [Room(name="합주실 A", opens_at=time(9), closes_at=time(23)),
                 Room(name="합주실 B", opens_at=time(12), closes_at=time(22))]
        session.add_all(rooms)
        start = date.today() + timedelta(days=1)
        session.flush()
        make_unavailable(rng, session, [admin, *people], start)
        reserve_from = date.today() + timedelta(days=RESERVE_FROM_DAYS)
        make_reservations(rng, session, rooms, teams, people, reserve_from)
        session.commit()

        print(f"사람 {PEOPLE}명, 팀 {len(teams)}개, 합주실 {len(rooms)}개")
        print(f"예약: {reserve_from} ~ {reserve_from + timedelta(days=4)} 사이")
        print(f"로그인: load01 ~ load{PEOPLE:02d} / 비밀번호 {PASSWORD}")


if __name__ == "__main__":
    main()
