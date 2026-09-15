"""E2E 검사 전용 DB 를 빈 상태로 만듭니다.

docker-compose.override.yml 의 e2e-api 서비스가 뜰 때마다 migration 직전에 실행합니다.
DB 가 없으면 생성하고, 있으면 public schema 를 통째로 삭제한 뒤 다시 만듭니다. table 단위로
삭제하지 않는 이유는 tests/conftest.py 의 test_engine 과 같습니다(이전 table·alembic_version 이 남음).

실행(COMMAND.md 12-1):
    docker compose --profile e2e up -d --force-recreate --wait e2e-api
"""

import os
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

# DB 이름이 이 글자로 끝나지 않으면 비우지 않습니다. DATABASE_URL 을 잘못 넘겨 dev DB 를 비우는 것을 막습니다.
E2E_SUFFIX = "_e2e"
# DB 를 생성할 때 접속하는 관리용 DB 입니다. postgres image 가 기본으로 만듭니다.
ADMIN_DATABASE = "postgres"


def main() -> None:
    url = make_url(os.environ["DATABASE_URL"])
    name = url.database or ""
    if not name.endswith(E2E_SUFFIX):
        sys.exit(f"DB '{name}' 는 이름이 {E2E_SUFFIX} 로 끝나지 않아 비우지 않습니다. DATABASE_URL 을 확인하세요.")

    admin = create_engine(url.set(database=ADMIN_DATABASE), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        exists = connection.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": name}
        ).scalar()
        if not exists:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()

    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    engine.dispose()


if __name__ == "__main__":
    main()
