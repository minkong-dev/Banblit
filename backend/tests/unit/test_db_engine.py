from typing import Any

import pytest

from backend.db import engine as engine_module
from backend.db.engine import create_db_engine


def _captured_options(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    captured: dict[str, Any] = {}

    def spy_create_engine(url: str, **options: object) -> str:
        captured["url"] = url
        captured.update(options)
        return "engine"

    monkeypatch.setattr(engine_module, "create_engine", spy_create_engine)
    assert create_db_engine("postgresql+psycopg://u:p@db:5432/x") == "engine"
    return captured


def test_create_db_engine_applies_fixed_connect_and_pool_timeouts(monkeypatch: pytest.MonkeyPatch) -> None:
    """connection 대기 5초, pool 대기 10초입니다. 환경변수로 변경하지 않습니다."""
    monkeypatch.setenv("DB_CONNECT_TIMEOUT", "3")
    monkeypatch.setenv("DB_POOL_TIMEOUT", "7")

    captured = _captured_options(monkeypatch)

    assert captured["url"] == "postgresql+psycopg://u:p@db:5432/x"
    assert captured["pool_timeout"] == 10
    assert captured["connect_args"]["connect_timeout"] == 5


def test_create_db_engine_limits_query_and_lock_waits(monkeypatch: pytest.MonkeyPatch) -> None:
    """쿼리 실행은 25초, 잠금 대기는 5초를 넘으면 DB 가 요청을 취소합니다. 환경변수로 변경하지 않습니다."""
    monkeypatch.setenv("DB_STATEMENT_TIMEOUT", "60")
    monkeypatch.setenv("DB_LOCK_TIMEOUT", "60")

    captured = _captured_options(monkeypatch)

    assert captured["connect_args"]["options"] == "-c statement_timeout=25000 -c lock_timeout=5000"
