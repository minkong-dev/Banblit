import logging

# FastAPI 는 HTTP 요청을 함수에 연결하는 웹 framework 입니다. 이 파일의 app 객체가 서버 1개이고,
# uvicorn 이 app 을 받아 요청을 전달합니다. 아래의 @app.exception_handler, @app.get, app.include_router 가 전부 app 에 등록됩니다.
# 함수 위의 @이름 (decorator)은 바로 아래 함수를 그 이름의 함수에 인자로 전달해 등록하는 문법입니다. routers/*.py 의 @router.get 도 같습니다.
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
# psycopg 는 PostgreSQL 드라이버입니다. QueryCanceled 는 statement_timeout 을 넘긴 쿼리를 DB 가 취소했을 때,
# LockNotAvailable 은 lock_timeout 안에 행 잠금을 얻지 못했을 때 발생합니다. 두 상한은 db/engine.py 가 지정합니다.
from psycopg.errors import LockNotAvailable, QueryCanceled
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.api.routers import (
    auth,
    boards,
    notifications,
    periods,
    permissions,
    reservations,
    roster,
    rooms,
    schedule,
    settings,
    unavailable,
)
from backend.api.auth_dependency import UNAUTHORIZED_DETAIL, SessionRejected
from backend.api.job_runner import MAX_CONCURRENT_JOBS, JobRunner
from backend.api.rate_limit import RateLimiter
from backend.contract import SESSION_REJECTED_CODE
from backend.db.pipeline import check_database

logger = logging.getLogger(__name__)

# backend 아래 모든 logger 의 기록을 container 의 표준 오류로 출력합니다. uvicorn 은 root logger 를 설정하지 않습니다.
# 이 파일은 level 을 설정하지 않습니다. INFO 가 필요한 모듈은 자기 logger 의 level 을 설정합니다(services/auth/password_reset.py).
_service_logs = logging.getLogger("backend")
if not _service_logs.handlers:
    # 이 모듈이 두 번 적재되면 handler 가 2개가 되어 같은 기록이 2줄씩 출력됩니다.
    # 두 번 적재되는 경우는 pytest 가 app 을 import 한 뒤 uvicorn 의 --reload 가 다시 적재할 때와, 테스트가 importlib.reload 를 호출할 때입니다.
    _service_handler = logging.StreamHandler()
    _service_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    _service_logs.addHandler(_service_handler)

app = FastAPI(title="Banblit Scheduling API")

# 같은 요청자가 window 초 안에 보낼 수 있는 요청 횟수입니다. 값은 (횟수 int, window 초 float) 입니다. 비밀번호를 하나씩
# 시도하는 것을 막지 못하면 짧은 비밀번호는 시도 횟수만 충분하면 맞힐 수 있습니다. 메일을 보내는 endpoint 는
# 다른 사람의 주소로 메일을 대량 발송하는 데 쓰일 수 있어 상한을 더 낮게 둡니다.
RATE_LIMITS: dict[str, tuple[int, float]] = {
    "login": (10, 300),
    "signup": (5, 3600),
    "mail": (5, 3600),
    "reset": (10, 3600),
    # 소셜 로그인 callback 입니다. 비밀번호 로그인과 bucket 을 나눠 한쪽의 429 가 다른 쪽을 막지 않게 합니다.
    "social": (20, 300),
}


def make_limiters() -> dict[str, RateLimiter]:
    """RATE_LIMITS 의 이름마다 빈 RateLimiter 를 생성합니다. router 는 api/rate_limit.py 의 limit_guesses(이름) 으로 참조합니다."""
    # dict comprehension 입니다. for 뒤의 반복이 먼저 실행되어 (name, (limit, window)) 를 1개씩 꺼내고, 그때마다 왼쪽의 key: value 를 1개 만듭니다.
    return {name: RateLimiter(limit=limit, window_seconds=window) for name, (limit, window) in RATE_LIMITS.items()}


# 요청 횟수와 배정 계산 작업은 process 메모리의 state 입니다. import 할 때가 아니라 app 을 만들 때 1번 생성합니다.
# 요청마다 만들면 횟수가 매번 0 이 되고, 작업 실행기가 요청마다 생겨 동시 실행 상한과 작업 조회가 동작하지 않습니다.
# app.state 는 FastAPI 가 제공하는 빈 객체로, 서버 1개가 공유하는 값을 속성으로 보관합니다. endpoint 는 request.app.state 로 읽습니다.
# limiters 는 api/rate_limit.py 의 limit_guesses 가, job_runner 는 api/routers/schedule.py 가 읽습니다.
app.state.limiters = make_limiters()
app.state.job_runner = JobRunner(max_concurrent=MAX_CONCURRENT_JOBS)


def _format_validation_error(exc: RequestValidationError) -> str:
    # 형식 오류를 "어느 항목: 무엇이 문제" 형식으로 결합합니다. 내용 오류(엔진에서 거부)와
    # 응답 모양을 맞춰, 화면이 detail 하나만 표시하면 되게 합니다.
    lines: list[str] = []
    for error in exc.errors():
        # error["loc"] 는 잘못된 값의 위치 경로입니다. 요청 본문이면 ("body", 항목 이름, ...) 이라 첫 칸 "body" 는 사용자에게 의미가 없어 제외합니다.
        location = " → ".join(str(part) for part in error["loc"] if part != "body")
        lines.append(f"{location}: {error['msg']}")
    return " / ".join(lines)


# async def 는 응답을 기다리는 동안 다른 요청을 처리할 수 있는 함수입니다. exception handler 는 Starlette 가 async 로 호출하므로 async def 로 둡니다.
# DB 를 호출하지 않는 함수라 await 할 대상은 없습니다.
@app.exception_handler(OperationalError)
async def handle_database_down(
    request: Request, exc: OperationalError
) -> JSONResponse:
    # 데이터베이스에 연결하지 못했거나 쿼리, 잠금 대기가 상한(db/engine.py)을 넘은 요청을 503으로 반환합니다.
    # 사용자 입력 오류(422)나 서버 고장(500)과 구분합니다. 자세한 사유는 로그에만 남깁니다.
    # exc.orig 는 SQLAlchemy 가 감싼 원래의 드라이버(psycopg) 예외입니다. 어떤 DB 오류인지는 원래 예외의 종류로 구분합니다.
    if isinstance(exc.orig, (QueryCanceled, LockNotAvailable)):
        logger.error("쿼리 또는 잠금 대기가 상한을 넘어 취소되었습니다 (%s): %s", request.url.path, exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "요청이 몰려 처리하지 못했어요. 잠시 후 다시 시도해주세요"},
        )
    logger.error("데이터베이스에 연결하지 못했습니다 (%s): %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "데이터베이스에 연결하지 못했어요. 잠시 후 다시 시도해주세요"},
    )


@app.exception_handler(IntegrityError)
async def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
    # db.commit.commit_translating 이 ValueError 로 변환하지 않은 IntegrityError 만 이 함수가
    # 처리합니다. 어떤 제약을 위반했는지는 로그에만 남기고, 화면에는 SQL 상세가 아니라
    # 사용자가 읽을 수 있는 문장 하나만 보냅니다.
    logger.error("데이터베이스 제약을 위반했습니다 (%s): %s", request.url.path, exc)
    return JSONResponse(
        status_code=409,
        content={"detail": "다른 데이터가 참조하고 있어 처리할 수 없어요"},
    )


@app.exception_handler(SessionRejected)
async def handle_session_rejected(request: Request, exc: SessionRejected) -> JSONResponse:
    # 같은 401 이라도 잘못된 비밀번호와 구분하도록 code 를 추가합니다. 화면은 이 code 를 받으면 로그인 화면으로 이동합니다.
    return JSONResponse(status_code=401, content={"detail": UNAUTHORIZED_DETAIL, "code": SESSION_REJECTED_CODE})


# handler 는 등록 순서가 아니라 exception 의 class 상속 순서(가장 가까운 부모부터)로 선택됩니다.
# SessionRejected 는 Exception 을 직접 상속하고 ValueError 가 아니므로 두 handler 는 서로 영향을 주지 않습니다.
# ValueError 는 422, PermissionError 는 403 으로 응답하고 detail 에 exception 의 문장 1개를 담습니다.
# 다른 상태 코드가 필요한 endpoint(로그인 실패 401 등)는 router 가 직접 처리합니다.
@app.exception_handler(ValueError)
async def handle_value_error(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(PermissionError)
async def handle_permission_error(request: Request, exc: PermissionError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": str(exc)})


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422, content={"detail": _format_validation_error(exc)}
    )


@app.get("/health")
def health() -> JSONResponse:
    # check_database로 실제 접속과 migration(데이터베이스 스키마 변경) 적용 여부를 확인하고
    # 그대로 반환합니다. 하나라도 실패하면 503으로 응답하여 reverse proxy가 이 서버를
    # 요청 분배에서 제외할 수 있게 합니다.
    database = check_database()
    checks = {"database": {"ok": database.ok, "detail": database.detail}}
    healthy = database.ok
    if not healthy:
        logger.error("health check 실패: %s", checks)
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "down", "checks": checks},
    )


# include_router 는 router 에 등록된 endpoint 전부를 app 에 추가합니다. router 는 backend/api/routers/<도메인>.py 마다 1개씩 정의되어 있습니다.
# 요청 주소가 서로 겹치지 않으므로 추가 순서는 응답에 영향을 주지 않습니다.
app.include_router(rooms.router)
app.include_router(periods.router)
app.include_router(roster.router)
app.include_router(boards.router)
app.include_router(auth.router)
app.include_router(unavailable.router)
app.include_router(reservations.router)
app.include_router(permissions.router)
app.include_router(notifications.router)
app.include_router(schedule.router)
app.include_router(settings.router)
