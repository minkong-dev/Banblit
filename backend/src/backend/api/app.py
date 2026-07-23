from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.mapping import request_to_engine, resolution_to_out
from backend.api.period_service import PeriodAssignResult, assign_period
from backend.api.schemas import (
    AssignRequest,
    ExcludedMemberOut,
    PeriodAssignIn,
    PeriodAssignmentOut,
    PeriodAssignOut,
    PeriodProposalOut,
    PeriodRoomSlotOut,
    ResolutionOut,
    RollbackOut,
    ScheduleOut,
    ScheduleRowOut,
)
from backend.db.models import Assignment, Period, Room, Team
from backend.db.schedule_store import rollback_schedule
from backend.db.session import get_session
from backend.scheduling.assignment import Assignment as EngineAssignment
from backend.scheduling.assignment import RoomSlot
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


@app.get("/periods/{period_id}/schedule", response_model=ScheduleOut)
def read_schedule(
    period_id: int, session: Session = Depends(get_session)
) -> ScheduleOut:
    period = session.get(Period, period_id)
    if period is None:
        raise HTTPException(status_code=422, detail="그런 기간이 없습니다")

    rows = session.execute(
        select(Assignment, Team.name, Room.name)
        .join(Team, Team.id == Assignment.team_id)
        .join(Room, Room.id == Assignment.room_id)
        .where(Assignment.period_id == period_id)
        .order_by(Assignment.starts_at, Room.name)
    ).all()
    return ScheduleOut(
        rows=[
            ScheduleRowOut(
                team_id=assignment.team_id,
                team=team_name,
                room_id=assignment.room_id,
                room=room_name,
                start=assignment.starts_at,
                end=assignment.ends_at,
            )
            for assignment, team_name, room_name in rows
        ]
    )


def _period_assignment_out(
    assignment: EngineAssignment, result: PeriodAssignResult
) -> PeriodAssignmentOut:
    def to_slot(room_slot: RoomSlot) -> PeriodRoomSlotOut:
        return PeriodRoomSlotOut(
            room_id=result.room_id_by_key[room_slot.room],
            room=result.room_name_by_key[room_slot.room],
            start=room_slot.interval.start,
            end=room_slot.interval.end,
        )

    return PeriodAssignmentOut(
        feasible=assignment.feasible,
        slots_by_team={
            team_name: [to_slot(rs) for rs in slots]
            for team_name, slots in assignment.slots_by_team.items()
        },
        open_slots=[to_slot(rs) for rs in assignment.open_slots],
    )


@app.post("/periods/{period_id}/assign", response_model=PeriodAssignOut)
def assign_period_schedule(
    period_id: int,
    req: PeriodAssignIn,
    session: Session = Depends(get_session),
) -> PeriodAssignOut:
    try:
        result = assign_period(
            session,
            period_id,
            req.team_ids,
            req.room_ids,
            saved_at=datetime.now(),
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return PeriodAssignOut(
        saved=result.saved,
        assignment=_period_assignment_out(result.resolution.assignment, result),
        proposals=[
            PeriodProposalOut(
                excluded_member=ExcludedMemberOut(
                    id=result.member_by_key[proposal.excluded_member][0],
                    name=result.member_by_key[proposal.excluded_member][1],
                ),
                assignment=_period_assignment_out(proposal.assignment, result),
            )
            for proposal in result.resolution.proposals
        ],
    )


@app.post("/periods/{period_id}/rollback", response_model=RollbackOut)
def rollback_period_schedule(
    period_id: int, session: Session = Depends(get_session)
) -> RollbackOut:
    period = session.get(Period, period_id)
    if period is None:
        raise HTTPException(status_code=422, detail="그런 기간이 없습니다")

    rolled_back = rollback_schedule(session, period_id)
    session.commit()
    return RollbackOut(rolled_back=rolled_back)
