import os
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from backend.db.models import PERMISSIONS

# 역할 열이 있던 시점과 permission set(권한 집합)으로 옮긴 시점입니다.
BEFORE = "010cbf76a692"
# permission set 으로 옮긴 뒤에도 권한 항목 목록이 여러 번 바뀌었습니다. 헤드매니저는 그 모든 이행을 거쳐
# "할 수 있는 일 전부"를 보유해야 하므로, 한 지점이 아니라 끝까지 올려 검증합니다.
AFTER = "head"

# 역할 복원 테스트는 이 migration(DB 구조를 바꾸는 단계별 기록) 하나만 upgrade·downgrade 합니다. 검증 범위를 좁게 둡니다.
# migration 전체가 끝까지 downgrade 되는지는 맨 아래 테스트가 따로 검증합니다.
MOVED = "b7f1a92c4d31"


@pytest.fixture()
def migration_db() -> Iterator[tuple[Engine, Config]]:
    """이 테스트 전용 DB 를 새로 만듭니다. 다른 테스트가 사용하는 DB 는 이미 head 까지 upgrade 되어 있어서 역할 열이 있던 시점으로 되돌릴 수 없습니다."""
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


# 권한 항목을 동작 단위로 나눈 migration 입니다. downgrade 할 때 이전 이름으로 다시 합칩니다.
SPLIT_PER_ACTION = "c1d5e83f4a29"
BEFORE_SPLIT = "b2d94f7a1c05"


def test_downgrading_the_split_keeps_permission_grant(
    migration_db: tuple[Engine, Config]
) -> None:
    """permission_grant는 분할 전에도 있던 이름입니다. 분할한 조각을 제거할 때 이
    이름까지 함께 제거하면 복구 후 아무도 권한을 부여할 수 없습니다."""
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
    """복구가 어디에서든 멈추면 그 아래 migration(DB 구조를 바꾸는 단계별 기록)은 모두 복구할 수 없습니다."""
    _, config = migration_db
    command.upgrade(config, "head")

    command.downgrade(config, "base")
