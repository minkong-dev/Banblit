import pytest

from backend.db import health as health_module
from backend.db.health import check_database


class _FakeResult:
    def __init__(self, value: object) -> None:
        self.value = value

    def scalar(self) -> object:
        return self.value


class _FakeConnection:
    def __init__(self, revision: object) -> None:
        self.revision = revision

    def __enter__(self) -> "_FakeConnection":
        return self

    def __exit__(self, *exc_info: object) -> None:
        pass

    def execute(self, statement: object) -> _FakeResult:
        # SELECT 1 과 alembic_version 조회가 차례로 들어온다. 앞의 것은 값을 안 본다.
        return _FakeResult(self.revision)


class _FakeEngine:
    def __init__(self, revision: object) -> None:
        self.revision = revision

    def connect(self) -> _FakeConnection:
        return _FakeConnection(self.revision)


def test_check_database_reports_the_applied_migration_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(health_module, "get_engine", lambda: _FakeEngine("a1b2c3"))

    status = check_database()

    assert status.ok is True
    assert "a1b2c3" in status.detail


def test_check_database_is_not_ok_before_migrations_are_applied(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """표는 있는데 적용된 회차가 없으면 기동 준비가 끝나지 않은 상태다."""
    monkeypatch.setattr(health_module, "get_engine", lambda: _FakeEngine(None))

    status = check_database()

    assert status.ok is False
    assert "마이그레이션" in status.detail


def test_check_database_reports_the_reason_when_it_cannot_connect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """끊겼는데 정상이라 답하면 장애를 격리할 수 없다. 이유를 그대로 담는다."""

    def refuse() -> object:
        raise OSError("connection refused")

    monkeypatch.setattr(health_module, "get_engine", refuse)

    status = check_database()

    assert status.ok is False
    assert "connection refused" in status.detail
