import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

from backend.db.models import Base

TEST_DB_NAME = "banblit_test"


@pytest.fixture(scope="session")
def test_engine() -> Engine:
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

    test_url = base_url.rsplit("/", 1)[0] + f"/{TEST_DB_NAME}"
    engine = create_engine(test_url)
    Base.metadata.drop_all(engine)
    with engine.begin() as connection:
        # drop_all은 Base.metadata에 속한 테이블만 지우고 alembic의 자체 이력
        # 테이블(alembic_version)은 남긴다. 이를 남겨두면 다음 세션 실행 때
        # alembic이 "이미 head"로 판단해 upgrade를 건너뛰어, 방금 지운 테이블이
        # 재생성되지 않는 채로 세션이 시작된다. 매 세션 실제 마이그레이션이
        # 처음부터 다시 적용되도록 이력 테이블도 함께 지운다.
        connection.execute(text("DROP TABLE IF EXISTS alembic_version"))

    alembic_config = Config("alembic.ini")
    alembic_config.set_main_option("sqlalchemy.url", test_url)
    # migrations/env.py는 DATABASE_URL 환경변수가 있으면 이를 항상 우선했으나,
    # 컨테이너 안에서는 DATABASE_URL이 항상 설정돼 있어(Task 1) 위 set_main_option이
    # 무시되고 테스트 DB가 아닌 메인 DB에 마이그레이션이 적용되는 문제가 있었다.
    # Config.attributes로 명시적 접속 주소를 전달해 env.py가 이를 최우선하도록 한다.
    alembic_config.attributes["sqlalchemy.url"] = test_url
    command.upgrade(alembic_config, "head")

    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(test_engine: Engine) -> Session:
    with Session(test_engine) as session:
        yield session
        session.rollback()
    # 테스트마다 깨끗한 상태로: 심어둔 포지션만 남기고 모든 행을 지운다.
    with test_engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            if table.name != "positions":
                connection.execute(table.delete())
