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
    # 데이터베이스에 연결하지 못한 요청을 503으로 반환합니다. 사용자 입력 오류(422)나
    # 서버 고장(500)과 구분하기 위해 사용합니다. 자세한 사유는 로그에만 남기고
    # 화면에는 표시하지 않습니다.
    logger.error("데이터베이스에 닿지 못했습니다 (%s): %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "데이터베이스에 연결하지 못했습니다. 잠시 후 다시 시도하십시오"},
    )


@app.exception_handler(IntegrityError)
async def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
    # db.commit.commit_translating 처럼 특정 제약을 미리 포착해 ValueError로 변환한 부분을
    # 통과한 IntegrityError만 여기로 옵니다. 어떤 제약을 위반했는지는 로그에만 남기고,
    # 화면에는 SQL 상세가 아니라 사용자가 읽을 수 있는 문장 하나만 보냅니다.
    logger.error("데이터 제약을 어겼습니다 (%s): %s", request.url.path, exc)
    return JSONResponse(
        status_code=409,
        content={"detail": "다른 데이터가 참조하고 있어 처리할 수 없습니다"},
    )


# 서비스 함수가 발생시키는 두 가지 exception(예외). 어느 endpoint(API의 요청 주소 단위)에서
# 발생하든 응답은 같습니다. 규칙 위반은 422, 권한 부족은 403이며, 둘 다 detail에 사용자가
# 읽을 수 있는 문장 하나씩 포함합니다. 라우터는 이 둘을 처리하지 않으며, 다른 상태 코드가
# 필요한 부분(로그인 401 등)만 직접 처리합니다.
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
        logger.error("정상 확인 실패: %s", checks)
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "down", "checks": checks},
    )


# 도메인 라우터를 추가합니다. 각 라우터는 table(데이터베이스의 행과 열로 이루어진 데이터 구조)
# 하나(또는 하나에 딸린 CRUD)만 처리하므로 room_service·period_crud_service·roster_service·
# board_service 같은 경계로 나누었습니다. 추가 순서는 응답에 영향을 주지 않습니다.
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
