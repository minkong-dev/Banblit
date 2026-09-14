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
    """서비스 함수가 발생시킨 검증 오류는 어느 endpoint에서 발생했든 상태 코드 422와 메시지로 응답합니다.
    모든 endpoint에서 동일한 처리를 하므로 각 라우터에서 반복적으로 작성할 필요가 없습니다."""
    response = _with_route("/_boom_value", ValueError("이름이 비어 있습니다"))

    assert response.status_code == 422
    assert response.json()["detail"] == "이름이 비어 있습니다"


def test_permission_error_becomes_403_with_the_message() -> None:
    response = _with_route("/_boom_permission", PermissionError("그 팀 소속이 아닙니다"))

    assert response.status_code == 403
    assert response.json()["detail"] == "그 팀 소속이 아닙니다"
