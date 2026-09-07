"""지난 공연의 팀 구성을 그대로 넣는다.

명단에 있는 사람은 전부 가입한 것으로 친다 — 이메일은 이름과 기수로 지어내고
비밀번호는 모두 같게 둔다. 실제 서비스 데이터가 아니라 화면을 열어 볼 밑감이다.

이름이 같은 두 사람(박민경)은 기수로 갈린다. 괄호는 이름에 남기지 않고 cohort 로
옮긴다 — 사람을 가르는 것은 id 이고, 기수는 화면에서 눈으로 가르기 위한 값이다.

실행:
    docker compose run --rm dev python scripts/seed_setlist.py
"""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.auth_service import hash_password
from backend.api.permission_service import grant_full_permissions
from backend.db.pipeline import get_engine
from backend.db.models import Member, Team, TeamSlot

PASSWORD = "banblit123"

# 기수를 아는 사람만 적는다. 나머지는 비워 둔다 — 모르는 값을 지어내지 않는다.
COHORTS = {"박민경(47기)": 47, "박민경(49기)": 49}

# (곡, 세션, 이름). 세션의 꼬리 숫자는 같은 악기의 몇 번째 자리인지를 뜻한다.
SETLIST = [
    ("청산", "보컬", "황찬우"),
    ("청산", "일렉1", "유지후"),
    ("청산", "일렉2", "안희연"),
    ("청산", "베이스", "이예은"),
    ("청산", "신디", "김대현"),
    ("청산", "드럼", "김민서"),
    ("불꽃놀이", "보컬", "장민정"),
    ("불꽃놀이", "일렉1", "고윤서"),
    ("불꽃놀이", "일렉2", "유지후"),
    ("불꽃놀이", "통기타", "박민경(49기)"),
    ("불꽃놀이", "베이스", "이은지"),
    ("불꽃놀이", "신디", "김보민"),
    ("불꽃놀이", "드럼", "김은우"),
    ("antifreeze", "보컬", "김민규"),
    ("antifreeze", "일렉1", "박민경(49기)"),
    ("antifreeze", "일렉2", "양유민"),
    ("antifreeze", "베이스", "박민경(47기)"),
    ("antifreeze", "드럼", "김민서"),
    ("antifreeze", "신디", "박보민"),
    ("알루미늄", "보컬", "황찬우"),
    ("알루미늄", "일렉1", "권제혁"),
    ("알루미늄", "일렉2", "고윤서"),
    ("알루미늄", "베이스", "이예은"),
    ("알루미늄", "드럼", "김은우"),
    ("곰팡이", "보컬", "장민정"),
    ("곰팡이", "일렉1", "유지후"),
    ("곰팡이", "통기타", "황찬우"),
    ("곰팡이", "신디", "김보민"),
    ("곰팡이", "드럼", "김민서"),
    ("곰팡이", "베이스", "이민아"),
    ("산책", "보컬", "양유민"),
    ("산책", "신디", "이예은"),
    ("사포닌 같은 너", "보컬", "손서윤"),
    ("사포닌 같은 너", "일렉1", "유지후"),
    ("사포닌 같은 너", "일렉2", "양유민"),
    ("사포닌 같은 너", "베이스", "이민아"),
    ("사포닌 같은 너", "드럼", "오선우"),
    ("사포닌 같은 너", "신디", "안희연"),
    ("bad", "보컬", "김민규"),
    ("bad", "일렉1", "권제혁"),
    ("bad", "일렉2", "박민경(49기)"),
    ("bad", "베이스", "이은지"),
    ("bad", "드럼", "박보민"),
    ("bad", "신디", "김은우"),
    ("우산을 들어줄게", "보컬", "양유민"),
    ("우산을 들어줄게", "일렉1", "유지후"),
    ("우산을 들어줄게", "일렉2", "권제혁"),
    ("우산을 들어줄게", "베이스", "이예은"),
    ("우산을 들어줄게", "드럼", "김민서"),
    ("우산을 들어줄게", "신디1", "안희연"),
    ("우산을 들어줄게", "신디2", "김대현"),
    ("나침반", "보컬", "양유민"),
    ("나침반", "일렉1", "유지후"),
    ("나침반", "일렉2", "황찬우"),
    ("나침반", "베이스", "박민경(47기)"),
    ("나침반", "드럼", "오선우"),
]


def split_session(label: str) -> tuple[str, int]:
    """세션 이름에서 악기와 자리 번호를 가른다. "일렉2" → ("일렉", 2)."""
    if label and label[-1].isdigit():
        return label[:-1], int(label[-1])
    return label, 1


def email_for(index: int) -> str:
    return f"member{index:02d}@banblit.test"


def main() -> None:
    engine = get_engine()
    with Session(engine) as session:
        if session.scalar(select(Team.id)) is not None:
            print("이미 팀이 있습니다. 비우고 다시 넣으려면 banblit down -Volumes 후 실행하세요.")
            return

        # 사람을 먼저 만든다. 자리는 사람을 가리키므로 순서가 반대일 수 없다.
        labels = sorted({label for _, _, label in SETLIST})
        members: dict[str, Member] = {}
        for index, label in enumerate(labels, start=1):
            member = Member(
                name=label.split("(")[0],
                cohort=COHORTS.get(label),
                email=email_for(index),
                password_hash=hash_password(PASSWORD),
            )
            session.add(member)
            members[label] = member
        session.flush()

        # 가장 먼저 가입한 사람이 권한 열한 개를 전부 갖는다는 규칙을 여기서도 지킨다.
        grant_full_permissions(session, members[labels[0]].id)

        by_team: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for song, label, who in SETLIST:
            by_team[song].append((label, who))

        for song in dict.fromkeys(song for song, _, _ in SETLIST):
            team = Team(name=song)
            session.add(team)
            session.flush()
            for label, who in by_team[song]:
                instrument, ordinal = split_session(label)
                session.add(
                    TeamSlot(
                        team_id=team.id,
                        instrument=instrument,
                        ordinal=ordinal,
                        member_id=members[who].id,
                    )
                )

        session.commit()
        print(f"사람 {len(members)}명, 팀 {len(by_team)}개를 넣었습니다.")
        print(f"로그인: {email_for(1)} ~ {email_for(len(members))} / 비밀번호 {PASSWORD}")
        print(f"권한을 전부 가진 사람: {members[labels[0]].name} ({email_for(1)})")


if __name__ == "__main__":
    main()
