import pytest
from fastapi.testclient import TestClient

from backend.api import app as app_module
from backend.api.app import app
from backend.db.health import DependencyStatus


def test_health_reports_each_dependency_when_everything_is_up(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """정상 상태만 보고하는 건강 확인으로는 장애를 포착할 수 없습니다.

    각 의존 대상이 실제로 연결되었는지 상태를 각각 포함해야 합니다.
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
    """연결이 끊긴 상태에서 정상이라 응답하면 장애의 원인을 파악할 수 없습니다.

    어느 의존 대상이 실패했는지, 그 이유가 명확히 표시되어야 합니다.
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
