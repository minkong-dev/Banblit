import pytest
from fastapi.testclient import TestClient

from backend.api import app as app_module
from backend.api.app import app
from backend.db.health import DependencyStatus


def test_health_reports_each_dependency_when_everything_is_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """살아 있다는 말만 하는 정상 확인은 아무것도 막지 못한다.

    의존 대상마다 실제로 연결됐는지를 각각 담아야 한다.
    """
    monkeypatch.setattr(
        app_module,
        "check_database",
        lambda: DependencyStatus(ok=True, detail="revision=abc123"),
    )

    response = TestClient(app).get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"]["ok"] is True
    assert body["checks"]["database"]["detail"] == "revision=abc123"


def test_health_reports_which_dependency_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """끊긴 상태에서 정상이라 답하면 장애를 격리할 수 없다.

    어느 의존 대상이 실패했는지 이름과 이유가 나와야 한다.
    """
    monkeypatch.setattr(
        app_module,
        "check_database",
        lambda: DependencyStatus(ok=False, detail="connection refused"),
    )

    response = TestClient(app).get("/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "down"
    assert body["checks"]["database"]["ok"] is False
    assert "connection refused" in body["checks"]["database"]["detail"]
