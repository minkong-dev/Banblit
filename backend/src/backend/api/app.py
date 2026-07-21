from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.api.mapping import request_to_engine, resolution_to_out
from backend.api.schemas import AssignRequest, ResolutionOut
from backend.scheduling.resolution import resolve

app = FastAPI(title="Banblit Scheduling API")


def _format_validation_error(exc: RequestValidationError) -> str:
    # 형식 오류를 "어느 항목: 무엇이 문제" 문장으로 합친다. 내용 오류(엔진 거부)와
    # 답장 모양을 맞춰, 화면이 detail 하나만 보여주면 되게 한다.
    lines: list[str] = []
    for error in exc.errors():
        location = " → ".join(str(part) for part in error["loc"] if part != "body")
        lines.append(f"{location}: {error['msg']}")
    return " / ".join(lines)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422, content={"detail": _format_validation_error(exc)}
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/assign", response_model=ResolutionOut)
def assign_schedule(req: AssignRequest) -> ResolutionOut:
    try:
        teams, rooms, slots_per_team = request_to_engine(req)
        result = resolve(teams, rooms, slots_per_team)
    except ValueError as error:
        # 엔진이 잘못된 입력을 거부하며 던진 메시지를 그대로 사용자에게 전한다.
        raise HTTPException(status_code=422, detail=str(error)) from error
    return resolution_to_out(result)
