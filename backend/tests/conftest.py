import os
import time
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.api.rate_limit import reset_all
from backend.db.models import Base, TeamSlot

def seat(
    session: Session, team_id: int, member_id: int, instrument: str = "보컬"
) -> TeamSlot:
    """팀의 그 악기 다음 번호에 사람을 앉힌다.

    자리 번호는 (팀 + 악기) 안에서만 겹치면 안 되는데, 시험마다 그것을 직접 세면
    한 팀에 두 사람을 넣을 때마다 번호를 손으로 맞춰야 한다. 여기서 한 번만 센다.
    """
    used = session.scalars(
        select(TeamSlot.ordinal).where(
            TeamSlot.team_id == team_id, TeamSlot.instrument == instrument
        )
    ).all()
    slot = TeamSlot(
        team_id=team_id,
        instrument=instrument,
        ordinal=max(used, default=0) + 1,
        member_id=member_id,
    )
    session.add(slot)
    return slot


# 검사 전용 DB 이름. 여러 검사를 동시에 돌릴 때만 환경변수로 갈라준다 —
# 같은 이름을 쓰면 서로의 표를 지우며 돈다.
TEST_DB_NAME = os.environ.get("TEST_DB_NAME", "banblit_test")


@pytest.fixture(scope="session")
def test_engine() -> Iterator[Engine]:
    """전용 테스트 DB를 만들고, 실제 마이그레이션을 적용해 스키마를 세운다."""
    base_url = os.environ["DATABASE_URL"]
    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        exists = connection.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"),
            {"name": TEST_DB_NAME},
        ).scalar()
        if not exists:
            connection.execute(text(f"CREATE DATABASE {TEST_DB_NAME}"))
    admin.dispose()

    # 주소를 글자로 자르면 뒤에 설정값이 붙는 순간 깨진다. URL 객체로 DB 이름만 바꾼다.
    test_url = make_url(base_url).set(database=TEST_DB_NAME).render_as_string(
        hide_password=False
    )
    engine = create_engine(test_url)
    with engine.begin() as connection:
        # 스키마를 통째로 비운다. 표 단위로 지우면 모델에서 없어진 옛 표(memberships
        # 같은 것)를 metadata 가 몰라 남고, 그 표의 외래키가 teams 를 붙들어 다시
        # 만들 수도 없다. alembic_version 도 여기서 함께 사라져, alembic 이 "이미
        # head" 로 보고 upgrade 를 건너뛰는 일도 없다.
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))

    alembic_config = Config("alembic.ini")
    alembic_config.set_main_option("sqlalchemy.url", test_url)
    # migrations/env.py 는 DATABASE_URL 환경변수를 set_main_option 보다 먼저 본다.
    # attributes 에 넣은 주소를 env.py 가 그 둘보다 우선해 쓴다 — 이게 없으면
    # 마이그레이션이 테스트 DB 가 아니라 메인 DB 에 적용된다.
    alembic_config.attributes["sqlalchemy.url"] = test_url
    command.upgrade(alembic_config, "head")

    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(test_engine: Engine) -> Iterator[Session]:
    with Session(test_engine) as session:
        yield session
        session.rollback()
    # 테스트마다 깨끗한 상태로: 모든 행을 지운다. 예전에는 마이그레이션이 심어둔
    # 포지션만 남겼는데, 그 표가 없어져 남길 것이 없다.
    with test_engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())


@pytest.fixture()
def api_client(db_session: Session) -> Iterator[TestClient]:
    """엔드포인트가 테스트 전용 세션을 쓰도록 갈아끼운 클라이언트.

    실제 앱은 요청마다 새 세션을 열지만, 테스트에서는 db_session 픽스처가 만든
    세션을 그대로 쓴다 — 테스트가 넣은 데이터를 엔드포인트가 같은 세션에서 본다.
    """
    from backend.api.app import app
    from backend.db.pipeline import get_session, get_session_factory

    # 배정 작업은 배경 스레드에서 db_session 과 다른 세션을 연다(Session은 스레드끼리
    # 공유하면 안 된다). 테스트에서도 같은 엔진에 새 세션을 열어야 그 스레드가 쓴
    # 값이 커밋된 뒤 db_session 에서도 보인다.
    test_engine = db_session.get_bind()
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_session_factory] = lambda: (
        lambda: Session(test_engine)
    )
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


# 계정 하나를 만들어 (계정 번호, 인증 쿠키)를 돌려주는 도우미의 모양. 검사 파일마다
# 같은 표기를 다시 적지 않도록 여기서 한 번만 적는다.
AccountFactory = Callable[[str, str], tuple[int, dict[str, str]]]


@pytest.fixture()
def account(api_client: TestClient) -> AccountFactory:
    """가입시켜 실제 계정을 만들고, (계정 번호, 인증 쿠키)를 돌려준다.

    한 시험 안에서 헤드매니저와 일반 멤버를 오가며 요청해야 하므로, 받은 쿠키를
    클라이언트 저장소에 남기지 않고 돌려준다 — 호출마다 cookies= 로 골라 실어야
    나중에 만든 계정이 앞의 계정을 덮어쓰지 않는다.

    맨 처음 가입한 사람이 헤드매니저다(.cluedoc/accounts-and-roles). 그래서 한
    시험에서 이 함수를 처음 부른 결과가 곧 헤드매니저 계정이다.
    """

    def make(name: str, email: str) -> tuple[int, dict[str, str]]:
        body = api_client.post(
            "/signup",
            json={
                "name": name,
                # 학과·학번은 사람을 가르는 값의 일부다. 이메일이 계정마다 다르므로
                # 학번도 그것으로 지어, 같은 이름이 여럿 나와도 부딪히지 않게 한다.
                "department": "실용음악과",
                "student_no": email.split("@")[0],
                "email": email,
                "password": "Password123!",
                "cohort": 46,
            },
        ).json()
        token = api_client.cookies.get("banblit_session")
        if token is None:
            raise AssertionError(f"가입이 인증 쿠키를 내려주지 않았습니다: {body}")
        api_client.cookies.clear()
        return body["account"]["id"], {"banblit_session": token}

    return make


@pytest.fixture()
def poll_job(api_client: TestClient) -> Callable[[str], dict[str, Any]]:
    """배정 요청은 202 로 접수만 되므로, 검사는 GET /jobs/{id} 를 이걸로 반복 조회한다.

    실제 계산은 실측상 최대 22.2초까지 걸린다(2026-08-28, AUDIT.md 4부). 시험은
    빠른 시나리오만 쓰므로 15초면 충분하지만, 코드가 깨져 status 가 영영 안 바뀌면
    시험이 멈춘 채 안 끝나지 않도록 상한을 둔다.
    """

    def wait(job_id: str, timeout: float = 15.0) -> dict[str, Any]:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            body = api_client.get(f"/jobs/{job_id}").json()["job"]
            if body["status"] in ("done", "failed"):
                return body
            time.sleep(0.05)
        raise AssertionError("제한 시간 안에 작업이 끝나지 않았습니다")

    return wait


# 바깥과 실제로 통신해야 도는 검사는 tests/integration/<의존 대상>/ 아래 둔다.
# 폴더 이름이 곧 표시 이름이다 — llm, broker 가 생기면 폴더를 하나 더 만들면 된다.
EXTERNAL_DEPENDENCIES = ("db", "llm", "broker")

_DB_FIXTURES = {"test_engine", "db_session", "api_client"}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    # 검사가 놓인 폴더를 보고 표시를 붙인다. 파일마다 손으로 붙이면 새 검사에서
    # 빠뜨리고, 그러면 실패가 코드 탓인지 환경 탓인지 갈라낼 수 없다.
    for item in items:
        parts = item.path.parts
        for dependency in EXTERNAL_DEPENDENCIES:
            if dependency in parts:
                item.add_marker(dependency)

        # unit 폴더의 검사가 실제 DB 픽스처를 쓰면 수집 단계에서 멈춘다.
        # DB 가 떠 있는 동안에는 조용히 통과해 버려, 폴더 분리가 무너진 것을
        # 아무도 눈치채지 못한다.
        if "unit" in parts and _DB_FIXTURES & set(getattr(item, "fixturenames", ())):
            raise pytest.UsageError(
                f"{item.nodeid} 은 tests/unit 에 있으면서 실제 DB 를 씁니다. "
                "tests/integration/db 로 옮기십시오"
            )


@pytest.fixture(autouse=True)
def _forget_rate_limits() -> None:
    """검사와 검사 사이에 요청 제한 셈을 지운다.

    문지기는 process 안에서 세므로, 지우지 않으면 앞 검사가 쓴 횟수가 뒤 검사에
    그대로 남아 로그인 검사부터 429 로 막힌다.
    """
    reset_all()
