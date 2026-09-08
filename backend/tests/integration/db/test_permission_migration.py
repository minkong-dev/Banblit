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
# 권한 묶음으로 옮긴 뒤에도 목록이 몇 번 바뀌었다. 헤드매니저는 그 모든 이동을 지나
# "할 수 있는 일 전부"를 들고 있어야 하므로, 한 지점이 아니라 끝까지 올려 견준다.
AFTER = "head"

# 역할 되돌리기 검사는 이 migration 하나만 오간다 — 무엇을 보는지 좁게 둔다.
# 사슬 전체가 끝까지 내려가는지는 맨 아래 검사가 따로 본다.
MOVED = "b7f1a92c4d31"


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
    command.upgrade(config, MOVED)

    command.downgrade(config, BEFORE)

    with engine.connect() as connection:
        rows = connection.execute(text("SELECT name, role FROM members")).all()
    roles: dict[str, str] = {name: role for name, role in rows}
    assert roles == {"헤드": "head_manager", "멤버": "member"}


# 항목을 동작 단위로 쪼갠 migration. 되돌릴 때 옛 이름으로 다시 합친다.
SPLIT_PER_ACTION = "c1d5e83f4a29"
BEFORE_SPLIT = "b2d94f7a1c05"


def test_downgrading_the_split_keeps_permission_grant(
    migration_db: tuple[Engine, Config]
) -> None:
    """permission_grant 는 쪼개기 전에도 있던 이름이다. 쪼갠 조각을 걷어낼 때 이
    이름까지 같이 걷어내면 되돌린 뒤 아무도 권한을 줄 수 없다."""
    engine, config = migration_db
    command.upgrade(config, "head")
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO permission_sets (name, description, permissions)"
                " VALUES ('전부', '모든 항목', :permissions)"
            ),
            {"permissions": list(PERMISSIONS)},
        )

    command.downgrade(config, BEFORE_SPLIT)

    with engine.connect() as connection:
        permissions = connection.execute(
            text("SELECT permissions FROM permission_sets WHERE name = '전부'")
        ).scalar_one()
    assert "permission_grant" in permissions
    assert "room_manage" in permissions


def test_the_whole_chain_can_be_downgraded_to_base(
    migration_db: tuple[Engine, Config]
) -> None:
    """되돌리기가 어디선가 멈추면 그 아래 migration 은 전부 되돌릴 수 없는 것이다."""
    _, config = migration_db
    command.upgrade(config, "head")

    command.downgrade(config, "base")
