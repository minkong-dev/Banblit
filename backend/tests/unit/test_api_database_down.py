import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from backend.api.app import app
from backend.db.pipeline import get_session


def _refuse_session() -> None:
    raise OperationalError("SELECT 1", {}, OSError("connection refused"))


def test_database_down_answers_503_not_500() -> None:
    """DB 가 끊겼을 때 무엇을 할지 정해두지 않으면 500 으로 새어 나간다.

    사용자 잘못이 아니라 이쪽이 지금 못 받는 상태이므로 503 으로 답한다.
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
    """사고가 나면 원인을 찾을 재료가 남아야 한다."""
    app.dependency_overrides[get_session] = _refuse_session
    try:
        with caplog.at_level(logging.ERROR):
            TestClient(app).get("/periods/1/schedule")
    finally:
        app.dependency_overrides.clear()

    assert any("connection refused" in record.getMessage() for record in caplog.records)


def test_database_down_does_not_leak_internals_to_the_user() -> None:
    """오류 문구가 내부 정보를 흘리면 안 된다 — 자세한 것은 기록에만 남긴다."""
    app.dependency_overrides[get_session] = _refuse_session
    try:
        response = TestClient(app).get("/periods/1/schedule")
    finally:
        app.dependency_overrides.clear()

    assert "SELECT" not in response.json()["detail"]
