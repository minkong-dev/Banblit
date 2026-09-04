import logging
import os
from collections.abc import Callable
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from backend.api.job_runner import Job, JobRunner, max_concurrent_jobs_from_env
from backend.api.mapping import assignment_out, request_to_engine, resolution_to_out
from backend.api.period_service import PeriodAssignResult, assign_period
from backend.api.routers import auth, boards, periods, reservations, roster, rooms, unavailable
from backend.api.schemas import (
    AssignRequest,
    ExcludedMemberOut,
    JobEnvelopeOut,
    JobOut,
    PeriodAssignIn,
    PeriodAssignmentOut,
    PeriodAssignOut,
    PeriodProposalOut,
    PeriodRoomSlotOut,
    ResolutionOut,
    RollbackOut,
    RoomSlotOut,
    ScheduleOut,
    ScheduleRowOut,
)
from backend.db.models import Assignment, Period, Room, Team
from backend.db.pipeline import (
    check_database,
    get_session,
    get_session_factory,
    rollback_schedule,
)
from backend.scheduling.pipeline import Assignment as EngineAssignment
from backend.scheduling.pipeline import RoomSlot, resolve

logger = logging.getLogger(__name__)

app = FastAPI(title="Banblit Scheduling API")

# 배정 계산을 접수해 배경 스레드에서 돌린다. 앱 하나에 하나만 둔다 — 요청마다 새로
# 만들면 스레드 풀과 작업 기록이 요청마다 따로 생겨 상한도 조회도 의미가 없어진다.
job_runner: JobRunner[PeriodAssignResult] = JobRunner(
    max_concurrent=max_concurrent_jobs_from_env()
)


def _format_validation_error(exc: RequestValidationError) -> str:
    # 형식 오류를 "어느 항목: 무엇이 문제" 문장으로 합친다. 내용 오류(엔진 거부)와
    # 답장 모양을 맞춰, 화면이 detail 하나만 보여주면 되게 한다.
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
    # room_service.commit_room 처럼 특정 제약을 미리 잡아 ValueError로 바꾸는 자리를
    # 지난 IntegrityError만 여기로 온다. 어떤 제약을 어겼는지는 기록에만 남기고,
    # 화면에는 SQL 상세가 아니라 사람이 읽을 문장 하나만 보낸다.
    logger.error("데이터 제약을 어겼습니다 (%s): %s", request.url.path, exc)
    return JSONResponse(
        status_code=409,
        content={"detail": "다른 데이터가 참조하고 있어 처리할 수 없습니다"},
    )


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
    # 하나라도 끊겼으면 503 으로 답해, 앞단이 이 서버를 빼고 돌 수 있게 한다.
    database = check_database()
    checks = {"database": {"ok": database.ok, "detail": database.detail}}
    healthy = database.ok
    if not healthy:
        logger.error("정상 확인 실패: %s", checks)
    return JSONResponse(
        status_code=200 if healthy else 503,
        content={"status": "ok" if healthy else "down", "checks": checks},
    )


# 도메인 라우터를 붙인다. 각 라우터는 표 하나(또는 하나에 딸린 CRUD)만 다루므로
# room_service·period_crud_service·roster_service·board_service 와 같은 경계로 나눴다.
# 순서는 응답에 영향이 없다 — 주소가 서로 겹치지 않기 때문이다.
app.include_router(rooms.router)
app.include_router(periods.router)
app.include_router(roster.router)
app.include_router(boards.router)
app.include_router(auth.router)
app.include_router(unavailable.router)
app.include_router(reservations.router)


@app.post("/assign", response_model=ResolutionOut[RoomSlotOut, str])
def assign_schedule(req: AssignRequest) -> ResolutionOut:
    try:
        teams, rooms_, slots_per_team, names = request_to_engine(req)
        result = resolve(teams, rooms_, slots_per_team)
    except ValueError as error:
        # 엔진이 잘못된 입력을 거부하며 던진 메시지를 그대로 사용자에게 전한다.
        raise HTTPException(status_code=422, detail=str(error)) from error
    # names 는 엔진이 쓴 번호를 요청에 적힌 이름으로 되돌린다.
    return resolution_to_out(result, names)


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
    out_rows: list[ScheduleRowOut] = []
    for assignment, team_name, room_name in rows:
        out_rows.append(
            ScheduleRowOut(
                team_id=assignment.team_id,
                team=team_name,
                room_id=assignment.room_id,
                room=room_name,
                start=assignment.starts_at,
                end=assignment.ends_at,
            )
        )
    return ScheduleOut(rows=out_rows)


def _period_assignment_out(
    assignment: EngineAssignment, result: PeriodAssignResult
) -> PeriodAssignmentOut:
    def to_slot(room_slot: RoomSlot) -> PeriodRoomSlotOut:
        # 엔진이 쓴 번호가 곧 저장소의 합주실 번호다. 이름만 대응표에서 찾아 붙인다.
        return PeriodRoomSlotOut(
            room_id=room_slot.room_id,
            room=result.room_names[room_slot.room_id],
            start=room_slot.interval.start,
            end=room_slot.interval.end,
        )

    def to_team_name(team_id: int) -> str:
        return result.team_names[team_id]

    return assignment_out(assignment, to_slot, to_team_name)


def _period_assign_out(result: PeriodAssignResult) -> PeriodAssignOut:
    proposals: list[PeriodProposalOut] = []
    for proposal in result.resolution.proposals:
        # 엔진이 쓴 번호가 곧 저장소의 사람 번호다. 이름만 대응표에서 찾아 붙인다.
        member_id = proposal.excluded_member
        proposals.append(
            PeriodProposalOut(
                excluded_member=ExcludedMemberOut(
                    id=member_id, name=result.member_names[member_id]
                ),
                assignment=_period_assignment_out(proposal.assignment, result),
            )
        )

    return PeriodAssignOut(
        saved=result.saved,
        assignment=_period_assignment_out(result.resolution.assignment, result),
        proposals=proposals,
    )


def _job_out(job: Job[PeriodAssignResult]) -> JobOut:
    return JobOut(
        id=job.id,
        period_id=job.period_id,
        status=job.status,
        requested_at=job.requested_at,
        finished_at=job.finished_at,
        result=_period_assign_out(job.result) if job.result is not None else None,
        error=job.error,
    )


@app.post("/periods/{period_id}/assign", response_model=JobEnvelopeOut, status_code=202)
def assign_period_schedule(
    period_id: int,
    req: PeriodAssignIn,
    session: Session = Depends(get_session),
    session_factory: Callable[[], Session] = Depends(get_session_factory),
) -> JobEnvelopeOut:
    # 여기서는 기간이 실제로 있는지만 빠르게 확인한다. 팀·합주실 존재 여부나
    # 배정 계산 자체(최대 22.2초, 2026-08-28 실측)는 접수를 막을 이유가 아니라
    # 배경 작업의 실패 사유이므로 job_runner 가 돌리는 쪽에서 다룬다.
    if session.get(Period, period_id) is None:
        raise HTTPException(status_code=422, detail="그런 기간이 없습니다")

    def compute() -> PeriodAssignResult:
        # 요청을 받은 스레드의 session 을 그대로 넘기지 않는다. SQLAlchemy Session 은
        # 스레드끼리 공유하면 안 되므로, 배경 스레드 전용 세션을 새로 연다.
        with session_factory() as job_session:
            return assign_period(
                job_session,
                period_id,
                req.team_ids,
                req.room_ids,
                saved_at=datetime.now(),
            )

    job = job_runner.submit(period_id, compute)
    return JobEnvelopeOut(job=_job_out(job))


@app.get("/jobs/{job_id}", response_model=JobEnvelopeOut)
def read_job(job_id: str) -> JobEnvelopeOut:
    job = job_runner.get(job_id)
    if job is None:
        raise HTTPException(status_code=422, detail="그런 작업이 없습니다")
    return JobEnvelopeOut(job=_job_out(job))


@app.post("/periods/{period_id}/rollback", response_model=RollbackOut)
def rollback_period_schedule(
    period_id: int, session: Session = Depends(get_session)
) -> RollbackOut:
    period = session.get(Period, period_id)
    if period is None:
        raise HTTPException(status_code=422, detail="그런 기간이 없습니다")

    try:
        # rollback_schedule 이 되돌리기와 확정을 함께 끝낸다. 방·시각 충돌이면
        # ScheduleConflict(ValueError)로 올라와 아래 except 가 422로 바꾼다.
        rolled_back = rollback_schedule(session, period_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return RollbackOut(rolled_back=rolled_back)


# 개발용 — 프로토타입 화면을 API 와 같은 출처로 내보낸다. 출처가 같아야 화면의
# fetch 가 CORS 에 막히지 않는다. PROTOTYPE_DIR 이 실제 폴더를 가리킬 때만 붙으므로
# 그 환경변수가 없는 배포에서는 이 자리가 아예 생기지 않는다.
_prototype_dir = os.environ.get("PROTOTYPE_DIR")
if _prototype_dir and os.path.isdir(_prototype_dir):
    app.mount(
        "/proto",
        StaticFiles(directory=_prototype_dir, html=True),
        name="prototypes",
    )
