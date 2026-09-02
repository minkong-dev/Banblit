import pytest

from backend.db import engine as engine_module
from backend.db.engine import create_db_engine


def test_create_db_engine_applies_connect_and_pool_timeouts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """접속 대기와 풀 대기에 시간 제한을 붙인다.

    두 값의 기본값은 무한이라, DB가 느려지면 요청이 매달린 채 접속 풀을 다 쓴다.
    """
    captured: dict[str, object] = {}

    def spy_create_engine(url: str, **options: object) -> str:
        captured["url"] = url
        captured.update(options)
        return "engine"

    monkeypatch.setattr(engine_module, "create_engine", spy_create_engine)
    monkeypatch.setenv("DB_CONNECT_TIMEOUT", "3")
    monkeypatch.setenv("DB_POOL_TIMEOUT", "7")

    created = create_db_engine("postgresql+psycopg://u:p@db:5432/x")

    assert created == "engine"
    assert captured["url"] == "postgresql+psycopg://u:p@db:5432/x"
    assert captured["pool_timeout"] == 7
    assert captured["connect_args"] == {"connect_timeout": 3}


def test_create_db_engine_falls_back_to_default_timeouts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """환경변수를 안 넣어도 시간 제한 없이 도는 일은 없어야 한다."""
    captured: dict[str, object] = {}

    def spy_create_engine(url: str, **options: object) -> str:
        captured.update(options)
        return "engine"

    monkeypatch.setattr(engine_module, "create_engine", spy_create_engine)
    monkeypatch.delenv("DB_CONNECT_TIMEOUT", raising=False)
    monkeypatch.delenv("DB_POOL_TIMEOUT", raising=False)

    create_db_engine("postgresql+psycopg://u:p@db:5432/x")

    assert captured["pool_timeout"] == engine_module.DEFAULT_POOL_TIMEOUT
    assert captured["connect_args"] == {
        "connect_timeout": engine_module.DEFAULT_CONNECT_TIMEOUT
    }
