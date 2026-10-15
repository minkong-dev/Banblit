import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
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
from backend.api.job_runner import JobRunner, max_concurrent_jobs_from_env
from backend.api.rate_limit import RateLimiter
from backend.contract import SESSION_REJECTED_CODE
from backend.db.pipeline import check_database

logger = logging.getLogger(__name__)

# uvicorn 은 자기 logger 만 설정하고 root logger 는 설정하지 않습니다. 그대로 두면 backend 의
# 기록이 어디로도 출력되지 않고 사라집니다. backend 아래 모든 logger 의 기록을 컨테이너
# 기록(표준 오류)으로 내보냅니다. root 에 붙이지 않는 이유는 SQLAlchemy 가 실행한 SQL 전부를
# INFO 로 출력하기 때문입니다.
#
# 수준(level)은 여기에서 올리지 않습니다. 여기에서 올리면 backend 아래 모든 모듈의 INFO 가
# 함께 통과하는데, mailer 의 INFO 에는 개발 환경용 메일 본문(재설정 token 포함)이 들어 있습니다.
# INFO 를 남겨야 하는 모듈이 자기 logger 의 수준을 직접 올립니다(services/auth/password_reset.py).
_service_logs = logging.getLogger("backend")
if not _service_logs.handlers:
    # 이 모듈이 두 번 적재되면 handler 가 2개가 되어 같은 기록이 2줄씩 출력됩니다.
    _service_handler = logging.StreamHandler()
    _service_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    _service_logs.addHandler(_service_handler)

app = FastAPI(title="Banblit Scheduling API")

# 같은 요청자가 window 초 안에 보낼 수 있는 요청 횟수입니다. (횟수, window 초) 입니다. 비밀번호를 하나씩
# 시도하는 것을 막지 못하면 짧은 비밀번호는 시도 횟수만 충분하면 맞힐 수 있습니다. 메일을 보내는 endpoint 는
# 다른 사람의 주소로 메일을 대량 발송하는 데 쓰일 수 있어 상한을 더 낮게 둡니다.
RATE_LIMITS: dict[str, tuple[int, float]] = {
    "login": (10, 300),
    "signup": (5, 3600),
    "mail": (5, 3600),
    "reset": (10, 3600),
}


def make_limiters() -> dict[str, RateLimiter]:
    """RATE_LIMITS 마다 빈 제한기를 만듭니다. router 는 api/rate_limit.py 의 limit_guesses(이름) 으로 씁니다."""
    return {name: RateLimiter(limit=limit, window_seconds=window) for name, (limit, window) in RATE_LIMITS.items()}


# 요청 횟수와 배정 계산 작업은 process 메모리의 state 입니다. import 할 때가 아니라 app 을 만들 때 1번 생성합니다.
# 요청마다 만들면 횟수가 매번 0 이 되고, 작업 실행기가 요청마다 생겨 동시 실행 상한과 작업 조회가 동작하지 않습니다.
app.state.limiters = make_limiters()
app.state.job_runner = JobRunner(max_concurrent=max_concurrent_jobs_from_env())


def _format_validation_error(exc: RequestValidationError) -> str:
    # 형식 오류를 "어느 항목: 무엇이 문제" 형식으로 결합합니다. 내용 오류(엔진에서 거부)와
    # 응답 모양을 맞춰, 화면이 detail 하나만 표시하면 되게 합니다.
    lines: list[str] = []
    for error in exc.errors():
        location = " → ".join(str(part) for part in error["loc"] if part != "body")
        lines.append(f"{location}: {error['msg']}")
    return " / ".join(lines)


@app.exception_handler(OperationalError)
async def handle_database_down(
    request: Request, exc: OperationalError
) -> JSONResponse:
    # 데이터베이스에 연결하지 못했거나 쿼리, 잠금 대기가 상한(db/engine.py)을 넘은 요청을 503으로 반환합니다.
    # 사용자 입력 오류(422)나 서버 고장(500)과 구분합니다. 자세한 사유는 로그에만 남깁니다.
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


# 서비스 함수가 발생시키는 exception(예외) 두 가지를 처리합니다. 어느 endpoint(API의 요청
# 주소 단위)에서 발생하든 응답은 같습니다. ValueError(규칙 위반)는 422, PermissionError(권한
# 부족)는 403이며, 둘 다 detail 에 사용자가 읽을 수 있는 문장 하나를 포함합니다. 라우터는 이 두
# exception 을 처리하지 않으며, 다른 상태 코드가 필요한 endpoint(로그인 실패 401 등)만 직접
# 처리합니다.
@app.exception_handler(SessionRejected)
async def handle_session_rejected(request: Request, exc: SessionRejected) -> JSONResponse:
    # 같은 401 이라도 틀린 비밀번호와 구분하도록 code 를 붙입니다. 화면은 이 code 를 받으면 로그인 화면으로 이동합니다.
    return JSONResponse(status_code=401, content={"detail": UNAUTHORIZED_DETAIL, "code": SESSION_REJECTED_CODE})


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


# 도메인 라우터를 추가합니다. 각 라우터는 table(데이터베이스의 행과 열로 이루어진 데이터 구조)
# 하나와 그 table 의 CRUD 만 처리하므로 room_service·period_crud_service·roster_service·
# board_service 와 같은 경계로 나누었습니다. 추가 순서는 응답에 영향을 주지 않습니다.
# 요청 주소가 서로 겹치지 않기 때문입니다.
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
