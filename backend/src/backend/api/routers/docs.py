"""Swagger UI 와 API 명세입니다. .env 의 API_DOCS_USER, API_DOCS_PASSWORD 로 basic auth 를 검증합니다.

API_DOCS_USER 나 API_DOCS_PASSWORD 가 비어 있으면 404 를 반환합니다. 시도 횟수는 app.py 의 RATE_LIMITS["docs"] 로 제한합니다.
"""

import os
import secrets
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from backend.api.rate_limit import RateLimiter, limit_guesses

# auto_error=False 이면 Authorization header 가 없을 때 None 을 전달합니다. 비밀번호가 비어 있을 때 401 대신 404 를 반환하려고 씁니다.
_basic = HTTPBasic(auto_error=False)


# IP 주소와 무관하게 틀린 비밀번호를 세는 key 입니다. IP 를 바꿔 가며 시도해도 RATE_LIMITS["docs_failures"] 를 넘기면 전원을 차단합니다.
_EVERYONE = "everyone"


def _too_many(wait: int) -> HTTPException:
    return HTTPException(
        status_code=429, detail="요청이 너무 많아요. 잠시 후 다시 시도해주세요", headers={"Retry-After": str(wait)}
    )


def require_developer(
    request: Request,
    _: None = Depends(limit_guesses("docs")),
    credentials: HTTPBasicCredentials | None = Depends(_basic),
) -> None:
    user = os.environ.get("API_DOCS_USER", "")
    password = os.environ.get("API_DOCS_PASSWORD", "")
    if user == "" or password == "":
        raise HTTPException(status_code=404)
    failures: RateLimiter = request.app.state.limiters["docs_failures"]
    now = time.monotonic()
    wait = failures.peek(_EVERYONE, now)
    if wait is not None:
        raise _too_many(wait)
    if credentials is None:
        raise HTTPException(status_code=401, headers={"WWW-Authenticate": 'Basic realm="docs"'})
    # compare_digest 는 비교 시간이 값과 무관합니다. 응답 시간으로 비밀번호를 추측하지 못하게 합니다.
    if not (
        secrets.compare_digest(credentials.username.encode(), user.encode())
        & secrets.compare_digest(credentials.password.encode(), password.encode())
    ):
        failures.check(_EVERYONE, now)
        raise HTTPException(status_code=401, headers={"WWW-Authenticate": 'Basic realm="docs"'})


router = APIRouter(dependencies=[Depends(require_developer)], include_in_schema=False)


@router.get("/docs")
def swagger_ui(request: Request) -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url=f"{request.scope.get('root_path', '')}/openapi.json", title=request.app.title
    )


@router.get("/openapi.json")
def openapi(request: Request) -> dict[str, Any]:
    # servers 가 없으면 Swagger UI 의 Try it out 이 /api 접두사 없이 요청합니다.
    return {**request.app.openapi(), "servers": [{"url": request.scope.get("root_path", "")}]}
