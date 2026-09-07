import os
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from backend.db.models import PERMISSIONS

# 역할 열이 아직 있던 시점과, 그것을 권한 묶음으로 옮긴 시점.
BEFORE = "010cbf76a692"
AFTER = "b7f1a92c4d31"


@pytest.fixture()
def migration_db() -> Iterator[tuple[Engine, Config]]:
    """이 검사 전용 DB를 새로 만든다. 다른 검사가 쓰는 DB는 이미 head 까지 올라가
    있어, 역할 열이 살아 있던 시점으로 되돌릴 수 없다."""
    base_url = os.environ["DATABASE_URL"]
    name = os.environ.get("TEST_DB_NAME", "banblit_test") + "_migration"

    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        # WITH (FORCE) 는 남아 있는 접속을 끊고 지운다 — 앞선 검사가 비정상 종료해
        # 접속이 남아 있어도 다음 실행이 막히지 않는다.
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


def test_the_head_manager_role_survives_the_move(
    migration_db: tuple[Engine, Config]
) -> None:
    engine, config = migration_db
    command.upgrade(config, BEFORE)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO members (name, role)"
                " VALUES ('헤드', 'head_manager'), ('멤버', 'member')"
            )
        )

    command.upgrade(config, AFTER)

    with engine.connect() as connection:
        holders = connection.execute(
            text(
                "SELECT m.name, s.permissions FROM members m"
                " JOIN member_permission_sets ms ON ms.member_id = m.id"
                " JOIN permission_sets s ON s.id = ms.permission_set_id"
            )
        ).all()
    assert len(holders) == 1
    assert holders[0][0] == "헤드"
    assert set(holders[0][1]) == set(PERMISSIONS)


def test_the_downgrade_puts_the_role_back(
    migration_db: tuple[Engine, Config]
) -> None:
    engine, config = migration_db
    command.upgrade(config, BEFORE)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO members (name, role)"
                " VALUES ('헤드', 'head_manager'), ('멤버', 'member')"
            )
        )
    command.upgrade(config, AFTER)

    command.downgrade(config, BEFORE)

    with engine.connect() as connection:
        rows = connection.execute(text("SELECT name, role FROM members")).all()
    roles: dict[str, str] = {name: role for name, role in rows}
    assert roles == {"헤드": "head_manager", "멤버": "member"}
