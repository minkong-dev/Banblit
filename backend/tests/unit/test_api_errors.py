from fastapi.testclient import TestClient
from httpx import Response

from backend.api.app import app


def _with_route(path: str, raiser: Exception) -> Response:
    """path 에 raiser 를 던지는 임시 경로를 달아 한 번 부르고 다시 뗀다."""

    @app.get(path)
    def boom() -> None:
        raise raiser

    try:
        return TestClient(app, raise_server_exceptions=False).get(path)
    finally:
        app.router.routes[:] = [
            r for r in app.router.routes if getattr(r, "path", None) != path
        ]


def test_value_error_becomes_422_with_the_message() -> None:
    """서비스 함수가 던진 규칙 위반은 어느 endpoint 에서 났든 422 와 그 문장이다 —
    라우터마다 같은 두 줄을 적지 않는다."""
    response = _with_route("/_boom_value", ValueError("이름이 비어 있습니다"))

    assert response.status_code == 422
    assert response.json()["detail"] == "이름이 비어 있습니다"


def test_permission_error_becomes_403_with_the_message() -> None:
    response = _with_route("/_boom_permission", PermissionError("그 팀 소속이 아닙니다"))

    assert response.status_code == 403
    assert response.json()["detail"] == "그 팀 소속이 아닙니다"
