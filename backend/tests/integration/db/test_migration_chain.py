import os
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from backend.db.models import PERMISSIONS


@pytest.fixture()
def migration_db() -> Iterator[tuple[Engine, Config]]:
    """이 테스트 전용 DB 를 새로 생성합니다. 다른 테스트가 사용하는 DB 는 이미 head 까지 upgrade 되어 있어 base 로 되돌릴 수 없습니다."""
    base_url = os.environ["DATABASE_URL"]
    name = os.environ.get("TEST_DB_NAME", "banblit_test") + "_migration"

    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        # WITH (FORCE)는 남아 있는 connection 을 끊고 삭제합니다. 앞선 테스트가 비정상 종료해
        # connection 이 남아 있어도 다음 실행이 진행됩니다.
        connection.execute(text(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)"))
        connection.execute(text(f"CREATE DATABASE {name}"))
    admin.dispose()

    url = make_url(base_url).set(database=name).render_as_string(hide_password=False)
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", url)
    config.attributes["sqlalchemy.url"] = url
    engine = create_engine(url)

    yield engine, config

    engine.dispose()


def test_the_initial_migration_seeds_the_rows_the_server_requires(
    migration_db: tuple[Engine, Config]
) -> None:
    """설정 행이 없으면 설정 조회가 RuntimeError 로 멈추고, permission set 이 없으면 관리자 계정에 권한을 부여할 수 없습니다."""
    engine, config = migration_db
    command.upgrade(config, "head")

    with engine.connect() as connection:
        slot_minutes = connection.execute(text("SELECT slot_minutes FROM settings")).scalar_one()
        permissions = connection.execute(
            text("SELECT permissions FROM permission_sets")
        ).scalar_one()

    assert slot_minutes == 60
    # 전 항목을 가진 permission set 하나입니다. 중복 없이 들어 있어야 합니다.
    assert sorted(permissions) == sorted(PERMISSIONS)


def test_the_whole_chain_can_be_downgraded_to_base(
    migration_db: tuple[Engine, Config]
) -> None:
    """복구가 어디에서든 멈추면 그 아래 migration(DB 구조를 변경하는 단계별 기록)은 모두 복구할 수 없습니다."""
    _, config = migration_db
    command.upgrade(config, "head")

    command.downgrade(config, "base")


def test_assignment_tables_have_an_index_on_the_period(
    migration_db: tuple[Engine, Config]
) -> None:
    """배정 저장·조회·삭제는 전부 period_id 로 행을 찾습니다. PostgreSQL 은 외래 키에 index 를 자동으로 생성하지 않으므로, index 가 없으면 배정 1회마다 두 table 을 처음부터 끝까지 읽습니다."""
    engine, config = migration_db
    command.upgrade(config, "head")

    with engine.connect() as connection:
        names = set(
            connection.execute(
                text("SELECT indexname FROM pg_indexes WHERE tablename IN ('assignments', 'assignment_backups')")
            ).scalars()
        )

    assert {"ix_assignments_period_id", "ix_assignment_backups_period_id_saved_at"} <= names
