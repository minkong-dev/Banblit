from fastapi import FastAPI, HTTPException

from backend.api.mapping import request_to_engine, resolution_to_out
from backend.api.schemas import AssignRequest, ResolutionOut
from backend.scheduling.resolution import resolve

app = FastAPI(title="Banblit Scheduling API")


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
