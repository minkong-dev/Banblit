from fastapi import FastAPI

from backend.api.mapping import request_to_engine, resolution_to_out
from backend.api.schemas import AssignRequest, ResolutionOut
from backend.scheduling.resolution import resolve

app = FastAPI(title="Banblit Scheduling API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/assign", response_model=ResolutionOut)
def assign_schedule(req: AssignRequest) -> ResolutionOut:
    teams, rooms, slots_per_team = request_to_engine(req)
    result = resolve(teams, rooms, slots_per_team)
    return resolution_to_out(result)
