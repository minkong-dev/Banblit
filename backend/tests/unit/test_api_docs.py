import pytest
from fastapi.testclient import TestClient

from backend.api.app import RATE_LIMITS, app

USER = "dev"
PASSWORD = "short-pass"


@pytest.fixture(autouse=True)
def docs_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_DOCS_USER", USER)
    monkeypatch.setenv("API_DOCS_PASSWORD", PASSWORD)


@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
def test_docs_require_the_developer_password(path: str) -> None:
    client = TestClient(app)

    assert client.get(path).status_code == 401
    assert client.get(path, auth=(USER, "wrong")).status_code == 401
    assert client.get(path, auth=(USER, PASSWORD)).status_code == 200


def test_openapi_points_requests_at_the_api_root_path() -> None:
    body = TestClient(app).get("/openapi.json", auth=(USER, PASSWORD)).json()

    assert body["servers"] == [{"url": "/api"}]
    assert "/api/openapi.json" in TestClient(app).get("/docs", auth=(USER, PASSWORD)).text


@pytest.mark.parametrize("variable", ["API_DOCS_USER", "API_DOCS_PASSWORD"])
def test_docs_are_hidden_when_a_credential_is_not_set(
    monkeypatch: pytest.MonkeyPatch, variable: str
) -> None:
    monkeypatch.delenv(variable)

    assert TestClient(app).get("/docs", auth=("", "")).status_code == 404


def test_docs_block_repeated_guesses() -> None:
    client = TestClient(app)
    limit, _ = RATE_LIMITS["docs"]
    for _ in range(limit):
        client.get("/docs", auth=(USER, "wrong"))

    assert client.get("/docs", auth=(USER, PASSWORD)).status_code == 429


def test_docs_block_everyone_after_too_many_failures_from_many_addresses() -> None:
    client = TestClient(app)
    limit, _ = RATE_LIMITS["docs_failures"]
    for i in range(limit):
        client.get("/docs", auth=(USER, "wrong"), headers={"x-forwarded-for": f"10.0.{i // 250}.{i % 250}, 172.0.0.1"})

    fresh = {"x-forwarded-for": "10.9.9.9, 172.0.0.1"}
    assert client.get("/docs", auth=(USER, PASSWORD), headers=fresh).status_code == 429


def test_redoc_is_not_served() -> None:
    assert TestClient(app).get("/redoc").status_code == 404
