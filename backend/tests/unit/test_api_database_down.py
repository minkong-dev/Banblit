import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from backend.api.app import app
from backend.db.pipeline import get_session


def _refuse_session() -> None:
    raise OperationalError("SELECT 1", {}, OSError("connection refused"))


def test_database_down_answers_503_not_500() -> None:
    """DB가 끊겼을 때 예외 처리를 하지 않으면 상태 코드 500으로 응답합니다.

    사용자의 잘못이 아니라 이 쪽이 현재 요청을 처리할 수 없는 상태이므로 503으로 응답합니다.
    """
    app.dependency_overrides[get_session] = _refuse_session
    try:
        response = TestClient(app).get("/periods/1/schedule")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert "데이터베이스" in response.json()["detail"]


def test_database_down_is_written_to_the_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """예외가 발생하면 원인을 파악할 수 있도록 로그에 기록됩니다."""
    app.dependency_overrides[get_session] = _refuse_session
    try:
        with caplog.at_level(logging.ERROR):
            TestClient(app).get("/periods/1/schedule")
    finally:
        app.dependency_overrides.clear()

    assert any("connection refused" in record.getMessage() for record in caplog.records)


def test_database_down_does_not_leak_internals_to_the_user() -> None:
    """오류 메시지가 내부 정보를 포함하지 않도록 합니다. 자세한 내용은 로그에만 기록합니다."""
    app.dependency_overrides[get_session] = _refuse_session
    try:
        response = TestClient(app).get("/periods/1/schedule")
    finally:
        app.dependency_overrides.clear()

    assert "SELECT" not in response.json()["detail"]
