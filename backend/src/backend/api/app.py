import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
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
    unavailable,
)
from backend.db.pipeline import check_database

logger = logging.getLogger(__name__)
app = FastAPI(title="Banblit Scheduling API")


def _format_validation_error(exc: RequestValidationError) -> str:
    # 형식 오류를 "어느 항목: 무엇이 문제" 문장으로 합친다. 내용 오류(엔진 거부)와
    # 응답 모양을 맞춰, 화면이 detail 하나만 보여주면 되게 한다.
    lines: list[str] = []
    for error in exc.errors():
        location = " → ".join(str(part) for part in error["loc"] if part != "body")
        lines.append(f"{location}: {error['msg']}")
    return " / ".join(lines)


@app.exception_handler(OperationalError)
async def handle_database_down(
    request: Request, exc: OperationalError
) -> JSONResponse:
    # DB 에 닿지 못한 요청을 503 으로 돌려준다. 사용자 잘못이 아니라 이쪽이 지금
    # 못 받는 상태이므로, 잘못된 입력(422)과도 서버 고장(500)과도 구분한다.
    # 자세한 사유는 기록에만 남기고 화면에는 넣지 않는다.
    logger.error("데이터베이스에 닿지 못했습니다 (%s): %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "데이터베이스에 연결하지 못했습니다. 잠시 후 다시 시도하십시오"},
    )


@app.exception_handler(IntegrityError)
async def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
    # db.commit.commit_translating 처럼 특정 제약을 미리 잡아 ValueError로 바꾸는 자리를
    # 지난 IntegrityError만 여기로 온다. 어떤 제약을 어겼는지는 기록에만 남기고,
    # 화면에는 SQL 상세가 아니라 사람이 읽을 문장 하나만 보낸다.
    logger.error("데이터 제약을 어겼습니다 (%s): %s", request.url.path, exc)
    return JSONResponse(
        status_code=409,
        content={"detail": "다른 데이터가 참조하고 있어 처리할 수 없습니다"},
    )


# 서비스 함수가 던지는 두 가지 거절. 어느 endpoint 에서 났든 응답은 같다 —
# 규칙 위반은 422, 자격 없음은 403, 둘 다 detail 에 사람이 읽을 문장 하나.
# 라우터는 이 둘을 잡지 않는다. 다른 상태 코드가 필요한 자리(로그인 401 등)만 직접 잡는다.
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
    # check_database 로 실제 접속과 마이그레이션 적용 여부를 확인해 그대로 싣는다.
    # 하나라도 끊겼으면 503 으로 답해, reverse proxy 가 이 서버를 빼고 동작할 수 있게 한다.
    database = check_database()
    checks = {"database": {"ok": database.ok, "detail": database.detail}}
    healthy = database.ok
    if not healthy:
        logger.error("정상 확인 실패: %s", checks)
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "down", "checks": checks},
    )


# 도메인 라우터를 붙인다. 각 라우터는 table 하나(또는 하나에 딸린 CRUD)만 다루므로
# room_service·period_crud_service·roster_service·board_service 와 같은 경계로 나눴다.
# 순서는 응답에 영향이 없다 — 주소가 서로 겹치지 않기 때문이다.
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
