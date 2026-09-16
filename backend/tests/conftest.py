import os
import time
import zlib
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from backend.api.rate_limit import reset_all
from backend.db.models import Base, Settings, TeamSlot
from backend.scheduling.slots import DEFAULT_SLOT_MINUTES

def seat(
    session: Session, team_id: int, member_id: int, instrument: str = "보컬"
) -> TeamSlot:
    """팀의 해당 포지션에 멤버를 배정합니다.

    배정 번호는 (팀 + 포지션) 조합 내에서만 중복되면 안 됩니다. 테스트마다
    직접 계산하면 한 팀에 두 멤버를 추가할 때마다 번호를 수동으로 조정해야 하므로,
    이 함수에서 한 번만 계산합니다.
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


# 테스트 전용 DB 이름입니다. 여러 테스트를 동시에 실행할 때는 환경변수로 이름을 구분합니다.
# 같은 이름을 사용하면 서로의 table 을 삭제합니다.
TEST_DB_NAME = os.environ.get("TEST_DB_NAME", "banblit_test")


@pytest.fixture(scope="session")
def test_engine() -> Iterator[Engine]:
    """전용 테스트 DB 를 생성하고, 실제 migration(DB 구조를 바꾸는 단계별 기록)을
    적용해 schema 를 구성합니다."""
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

    # URL을 문자열로 자르면 뒤에 설정값이 붙는 순간 손상됩니다. URL 객체로 DB 이름만 변경합니다.
    test_url = make_url(base_url).set(database=TEST_DB_NAME).render_as_string(
        hide_password=False
    )
    engine = create_engine(test_url)
    with engine.begin() as connection:
        # schema 를 완전히 비웁니다. table 단위로 삭제하면 model 에서 제거된
        # 이전 table(memberships 등)을 metadata 가 인식하지 못해 남고,
        # 그 table 의 foreign key 가 teams 를 참조해 teams 를 다시 생성할 수도 없습니다.
        # alembic_version 도 함께 삭제되어 alembic 이 "이미 최신"으로 인식하고
        # upgrade 를 건너뛰는 문제도 방지합니다.
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))

    alembic_config = Config("alembic.ini")
    alembic_config.set_main_option("sqlalchemy.url", test_url)
    # migrations/env.py 는 DATABASE_URL 환경변수를 set_main_option 보다 먼저 확인합니다.
    # attributes 에 넣은 주소를 env.py 가 그 둘보다 우선해 사용합니다. 이 설정이 없으면
    # migration 이 테스트 DB 가 아니라 메인 DB 에 적용됩니다.
    alembic_config.attributes["sqlalchemy.url"] = test_url
    command.upgrade(alembic_config, "head")

    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(test_engine: Engine) -> Iterator[Session]:
    with Session(test_engine) as session:
        yield session
        session.rollback()
    # 테스트 사이의 격리를 위해 모든 행을 삭제합니다. settings 만 지우지 않고 기본값으로
    # 되돌립니다. 그 한 줄은 테스트가 만든 데이터가 아니라 migration 이 넣는 schema 의
    # 일부여서, 지우면 칸 크기를 읽는 코드가 전부 실패합니다(services/settings_service.py 의 _row).
    # 그렇다고 그대로 두면 값을 바꾼 테스트가 다음 테스트로 새어 나갑니다.
    with test_engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            if table.name == "settings":
                continue
            connection.execute(table.delete())
        connection.execute(
            update(Settings).values(slot_minutes=DEFAULT_SLOT_MINUTES)
        )


@pytest.fixture()
def api_client(db_session: Session) -> Iterator[TestClient]:
    """endpoint(API의 요청 주소 단위)가 테스트 전용 session 을 사용하도록
    설정한 클라이언트입니다.

    실제 앱은 요청마다 새 session 을 열지만, 테스트에서는 db_session fixture(테스트마다
    준비해 주는 값)가 생성한 session 을 그대로 사용합니다. 테스트가 추가한 데이터를
    endpoint 가 같은 session 에서 확인합니다.
    """
    from backend.api.app import app
    from backend.db.pipeline import get_session, get_session_factory

    # 배정 작업은 백그라운드 스레드에서 db_session 과 다른 session 을 엽니다(Session 은 스레드끼리
    # 공유하면 안 됩니다). 테스트에서도 같은 engine 에 새 session 을 열어야 그 스레드가 저장한
    # 값이 commit 된 뒤 db_session 에서도 조회됩니다.
    test_engine = db_session.get_bind()
    app.dependency_overrides[get_session] = lambda: db_session
    app.dependency_overrides[get_session_factory] = lambda: (
        lambda: Session(test_engine)
    )
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


# 계정 하나를 생성해 (계정 번호, 인증 cookie)를 반환하는 함수의 타입입니다.
# 테스트 파일마다 같은 정의를 다시 적지 않도록 이 파일에서 한 번만 정의합니다.
AccountFactory = Callable[[str, str], tuple[int, dict[str, str]]]


# 테스트가 사용하는 관리자코드입니다. 실제 값은 배포마다 다르고 .env 가 정합니다.
TEST_ADMIN_CODE = "test-admin-code"


@pytest.fixture(autouse=True)
def admin_code(monkeypatch: pytest.MonkeyPatch) -> str:
    """모든 테스트에 관리자코드 환경변수를 설정하고 그 값을 반환합니다.

    autouse 인 이유는 account fixture 가 첫 계정을 만들 때 이 코드를 사용하기 때문입니다.
    환경변수를 지우는 시나리오는 테스트가 monkeypatch.delenv 로 직접 지웁니다.
    """
    monkeypatch.setenv("ADMIN_SIGNUP_CODE", TEST_ADMIN_CODE)
    return TEST_ADMIN_CODE


@pytest.fixture()
def account(api_client: TestClient) -> AccountFactory:
    """가입을 통해 실제 계정을 생성하고, (계정 번호, 인증 cookie)를 반환합니다.

    한 테스트 안에서 헤드매니저와 일반 멤버를 번갈아 요청해야 하므로, 받은 cookie 를
    클라이언트에 저장하지 않고 반환합니다. 호출마다 cookies= 매개변수로
    선택해 전달해야 나중에 생성한 계정이 앞의 계정을 덮어쓰지 않습니다.

    한 테스트에서 이 함수를 처음 호출한 결과가 헤드매니저 계정입니다. 첫 호출에만 관리자코드를
    넣기 때문입니다(사용자 결정 2026-09-16). 그 뒤의 호출은 권한 0개로 가입합니다.
    """
    made = 0

    def make(name: str, email: str) -> tuple[int, dict[str, str]]:
        nonlocal made
        made += 1
        body = api_client.post(
            "/signup",
            json={
                **({"admin_code": TEST_ADMIN_CODE} if made == 1 else {}),
                "name": name,
                # 학과·학번은 사람을 구분하는 값의 일부입니다. 이메일이 계정마다 다르므로
                # 학번도 이메일에서 생성합니다(8자리 숫자 규칙에 맞춰). 같은 이름이 2명 이상
                # 있어도 충돌하지 않습니다.
                "department": "실용음악과",
                "student_no": f"{zlib.crc32(email.encode()) % 10**8:08d}",
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
    """배정 요청은 202로 접수만 되므로, 테스트는 GET /jobs/{id}를 이 함수로 반복 조회합니다.

    실제 계산은 실측상 최대 22.2초까지 걸립니다(2026-08-28, AUDIT.md 4부). 테스트는
    빠른 시나리오만 사용하므로 15초면 충분하지만, 코드가 손상되어 status가 변경되지 않으면
    테스트가 멈춘 채 끝나지 않도록 상한을 설정합니다.
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


# 외부와 실제로 통신해야 하는 테스트는 tests/integration/<의존 대상>/ 아래에 둡니다.
# 폴더 이름이 곧 marker 이름입니다. llm, broker 가 생기면 폴더를 하나 더 만듭니다.
EXTERNAL_DEPENDENCIES = ("db", "llm", "broker")

_DB_FIXTURES = {"test_engine", "db_session", "api_client"}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    # 테스트가 있는 폴더를 확인하고 marker 를 붙입니다. 파일마다 수동으로 붙이면
    # 새 테스트에서 빠뜨리고, 그러면 실패가 코드 탓인지 환경 탓인지 구분할 수 없습니다.
    for item in items:
        parts = item.path.parts
        for dependency in EXTERNAL_DEPENDENCIES:
            if dependency in parts:
                item.add_marker(dependency)

        # unit 폴더의 테스트가 실제 DB fixture를 사용하면 수집 단계에서 멈춥니다.
        # DB가 실행 중인 동안에는 오류 메시지 없이 통과해버려 폴더 분리가 무너진 것을
        # 아무도 감지하지 못합니다.
        if "unit" in parts and _DB_FIXTURES & set(getattr(item, "fixturenames", ())):
            raise pytest.UsageError(
                f"{item.nodeid} 은 tests/unit 에 있으면서 실제 DB 를 씁니다. "
                "tests/integration/db 로 옮기십시오"
            )


@pytest.fixture(autouse=True)
def _forget_rate_limits() -> None:
    """테스트와 테스트 사이에 rate limit(요청 횟수 제한) 기록을 초기화합니다.

    rate limiter 는 process 메모리에서 세므로, 초기화하지 않으면 이전 테스트가
    사용한 횟수가 다음 테스트에 남아 로그인 테스트부터 429 로 거부됩니다.
    """
    reset_all()
