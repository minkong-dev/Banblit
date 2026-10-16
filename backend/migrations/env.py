import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from backend.db.models import Base

config = context.config
# 접속 주소는 호출자(tests/conftest.py 등)가 Config.attributes 로 지정한 값이 우선이고, 없으면 DATABASE_URL 환경변수입니다.
database_url = config.attributes.get("sqlalchemy.url") or os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL 환경변수가 존재하지 않습니다. docker compose run --rm dev alembic 으로 실행하십시오.")
config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    # disable_existing_loggers=False 이면 migration 을 호출한 서버와 테스트의 logger 를 유지합니다.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# autogenerate 가 비교하는 model 정의입니다.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    # DB 에 접속하지 않고 SQL 문을 출력합니다(alembic upgrade --sql).
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # DB 에 접속해 migration 을 적용합니다.
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
