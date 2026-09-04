import asyncio

from sqlalchemy.exc import IntegrityError
from starlette.requests import Request

from backend.api.app import handle_integrity_error


def _request(path: str = "/posts/1/comments") -> Request:
    scope = {"type": "http", "path": path, "headers": []}
    return Request(scope)


def test_handle_integrity_error_returns_409_with_a_generic_message() -> None:
    exc = IntegrityError(
        "INSERT INTO comments ...", {}, Exception("comments_author_id_fkey violates")
    )

    response = asyncio.run(handle_integrity_error(_request(), exc))

    assert response.status_code == 409
    assert b"comments_author_id_fkey" not in response.body
    assert b"detail" in response.body
