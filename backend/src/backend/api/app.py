from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.api.mapping import request_to_engine, resolution_to_out
from backend.api.schemas import AssignRequest, ResolutionOut
from backend.scheduling.resolution import resolve

app = FastAPI(title="Banblit Scheduling API")


@app.exception_handler(ValueError)
async def handle_value_error(request: Request, exc: ValueError) -> JSONResponse:
    # 엔진이 잘못된 입력을 거부하며 던진 메시지를 그대로 사용자에게 전한다.
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/assign", response_model=ResolutionOut)
def assign_schedule(req: AssignRequest) -> ResolutionOut:
    teams, rooms, slots_per_team = request_to_engine(req)
    result = resolve(teams, rooms, slots_per_team)
    return resolution_to_out(result)
