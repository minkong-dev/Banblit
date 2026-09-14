import pytest

from backend.db import engine as engine_module
from backend.db.engine import create_db_engine


def test_create_db_engine_applies_connect_and_pool_timeouts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """connection 대기와 pool 대기에 시간 제한을 설정합니다.

    기본값이 무한대이므로, DB 가 느려지면 대기 중인 요청이 connection pool 을 모두 차지합니다.
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
    """환경 변수가 없어도 기본값으로 시간 제한이 적용됩니다."""
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


def test_create_db_engine_rejects_useless_timeout_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """0 이하이거나 숫자가 아닌 값은 기본값을 사용합니다.

    음수는 psycopg가 시간 제한 없음으로 해석하므로, 차단하려던 무한 대기를 다시 만듭니다.
    -- 형태의 값은 정수로 변환할 때 예외가 발생하여 서버 시작 자체가 실패합니다.
    """
    for bad in ("-5", "0", "--5", "5초", ""):
        captured: dict[str, object] = {}

        def spy_create_engine(url: str, **options: object) -> str:
            captured.update(options)
            return "engine"

        monkeypatch.setattr(engine_module, "create_engine", spy_create_engine)
        monkeypatch.setenv("DB_CONNECT_TIMEOUT", bad)
        monkeypatch.setenv("DB_POOL_TIMEOUT", bad)

        create_db_engine("postgresql+psycopg://u:p@db:5432/x")

        assert captured["pool_timeout"] == engine_module.DEFAULT_POOL_TIMEOUT, bad
        assert captured["connect_args"] == {
            "connect_timeout": engine_module.DEFAULT_CONNECT_TIMEOUT
        }, bad
