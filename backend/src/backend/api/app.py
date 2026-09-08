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

from backend.api.auth_dependency import require_account, require_permission
from backend.api.job_runner import Job, JobRunner, max_concurrent_jobs_from_env
from backend.api.mapping import assignment_out, request_to_engine, resolution_to_out
from backend.api.notification_service import notify_assignment_updated
from backend.api.period_service import (
    PeriodAssignResult,
    assign_period,
    open_slots_in_period,
)
from backend.api.routers import (
    auth,
    boards,
    notifications,
    periods,
    permissions,
    reservations,
    roster,
    rooms,
    unavailable,
)
from backend.api.schemas import (
    AssignRequest,
    BackupOut,
    BackupRoundOut,
    BackupsOut,
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
from backend.db.models import Assignment, AssignmentBackup, Period, Room, Team
from backend.db.pipeline import (
    check_database,
    get_session,
    get_session_factory,
    list_backup_rounds,
    rollback_schedule,
)
from backend.scheduling.pipeline import Assignment as EngineAssignment
from backend.scheduling.pipeline import RoomSlot, resolve

logger = logging.getLogger(__name__)

app = FastAPI(title="Banblit Scheduling API")

# 배정 계산을 접수해 배경 스레드에서 실행한다. 앱 하나에 하나만 둔다 — 요청마다 새로
# 만들면 스레드 풀과 작업 기록이 요청마다 따로 생겨 상한도 조회도 의미가 없어진다.
job_runner: JobRunner[PeriodAssignResult] = JobRunner(
    max_concurrent=max_concurrent_jobs_from_env()
)


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


# 저장하지 않는 계산이지만 최대 22.2초까지 걸린다(2026-08-28 실측). 로그인을
# 요구하지 않으면 이 endpoint 하나로 서버를 묶을 수 있어 require_account 를 건다.
@app.post(
    "/assign",
    response_model=ResolutionOut[RoomSlotOut, str],
    dependencies=[Depends(require_account)],
)
def assign_schedule(req: AssignRequest) -> ResolutionOut:
    try:
        teams, rooms_, slots_per_team, names = request_to_engine(req)
        result = resolve(teams, rooms_, slots_per_team)
    except ValueError as error:
        # 엔진이 잘못된 입력을 거부하며 던진 메시지를 그대로 사용자에게 전한다.
        raise HTTPException(status_code=422, detail=str(error)) from error
    # names 는 엔진이 쓴 번호를 요청에 적힌 이름으로 되돌린다.
    return resolution_to_out(result, names)


@app.get(
    "/periods/{period_id}/schedule",
    response_model=ScheduleOut,
    dependencies=[Depends(require_account)],
)
def read_schedule(
    period_id: int,
    session: Session = Depends(get_session),
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

    # 남는 slot 을 시간표와 같은 응답에 싣는다. 화면은 open_slots 만 보고 예약 가능한
    # 시간을 연다 — 따로 물으러 오게 두면 배정 계산(최대 22.2초)을 다시 실행하는
    # endpoint 가 필요해진다. 운영시간이 30분 slot 으로 안 쪼개지는 방이 섞이면
    # ValueError 로 온다.
    try:
        open_slots = open_slots_in_period(session, period)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return ScheduleOut(
        rows=out_rows,
        open_slots=[
            PeriodRoomSlotOut(
                room_id=slot.room_id,
                room=slot.room,
                start=slot.start,
                end=slot.end,
            )
            for slot in open_slots
        ],
    )


def _period_assignment_out(
    assignment: EngineAssignment, result: PeriodAssignResult
) -> PeriodAssignmentOut:
    def to_slot(room_slot: RoomSlot) -> PeriodRoomSlotOut:
        # 엔진이 쓴 번호가 곧 DB 의 합주실 번호다. 이름만 대응표에서 찾아 붙인다.
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
        # 엔진이 쓴 번호가 곧 DB 의 사람 번호다. 이름만 대응표에서 찾아 붙인다.
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


def _submit_assign_job(
    period_id: int,
    req: PeriodAssignIn,
    session: Session,
    session_factory: Callable[[], Session],
    excluded_member_id: int | None,
) -> JobEnvelopeOut:
    # 여기서는 기간이 실제로 있는지만 빠르게 확인한다. 팀·합주실 존재 여부나
    # 배정 계산 자체(최대 22.2초, 2026-08-28 실측)는 접수를 막을 이유가 아니라
    # 배경 작업의 실패 사유이므로 job_runner 가 실행하는 쪽에서 다룬다.
    if session.get(Period, period_id) is None:
        raise HTTPException(status_code=422, detail="그런 기간이 없습니다")

    def compute() -> PeriodAssignResult:
        # 요청을 받은 스레드의 session 을 그대로 넘기지 않는다. SQLAlchemy Session 은
        # 스레드끼리 공유하면 안 되므로, 배경 스레드 전용 세션을 새로 연다.
        with session_factory() as job_session:
            result = assign_period(
                job_session,
                period_id,
                req.team_ids,
                req.room_ids,
                saved_at=datetime.now(),
                excluded_member_id=excluded_member_id,
            )
            # 사람이 눌러 다시 계산한 것도 시간표를 바꾼다. 저장이 실제로 된 때만
            # 알린다 — 배정할 slot 을 못 찾아 조율안만 나온 경우에는 보던 시간표가 그대로다.
            if result.saved:
                notify_assignment_updated(job_session, period_id, datetime.now())
            return result

    job = job_runner.submit(period_id, compute)
    return JobEnvelopeOut(job=_job_out(job))


@app.post(
    "/periods/{period_id}/assign",
    response_model=JobEnvelopeOut,
    status_code=202,
    dependencies=[Depends(require_permission("assign_run"))],
)
def assign_period_schedule(
    period_id: int,
    req: PeriodAssignIn,
    session: Session = Depends(get_session),
    session_factory: Callable[[], Session] = Depends(get_session_factory),
) -> JobEnvelopeOut:
    return _submit_assign_job(period_id, req, session, session_factory, None)


# 조율안을 고르는 endpoint. 계산 결과는 프로세스 메모리에만 있어 서버가 조율안의 배정을
# 다시 꺼낼 수 없으므로, 그 사람을 뺀 채로 다시 계산해 저장한다 — /assign 과 같은
# 입력에 excluded_member_id 만 얹은 것이라 저장 경로가 하나로 유지된다.
# 계산이 다시 실행되는 만큼 여기도 202 로 접수하고 결과는 GET /jobs/{id} 로 받는다.
@app.post(
    "/periods/{period_id}/proposals/{member_id}/confirm",
    response_model=JobEnvelopeOut,
    status_code=202,
    dependencies=[Depends(require_permission("proposal_confirm"))],
)
def confirm_period_proposal(
    period_id: int,
    member_id: int,
    req: PeriodAssignIn,
    session: Session = Depends(get_session),
    session_factory: Callable[[], Session] = Depends(get_session_factory),
) -> JobEnvelopeOut:
    return _submit_assign_job(period_id, req, session, session_factory, member_id)


# 여기서 나가는 JobEnvelopeOut 에는 계산 결과와, 아직 확정되지 않은 조율안과
# 거기서 빠지는 사람이 들어 있다 — 그것을 보는 항목이 assign_read 다.
@app.get(
    "/jobs/{job_id}",
    response_model=JobEnvelopeOut,
    dependencies=[Depends(require_permission("assign_read"))],
)
def read_job(job_id: str) -> JobEnvelopeOut:
    job = job_runner.get(job_id)
    if job is None:
        raise HTTPException(status_code=422, detail="그런 작업이 없습니다")
    return JobEnvelopeOut(job=_job_out(job))


# 되돌리기가 어느 회차로 갈지 고르는 목록이다. 되돌리기와 같은 자격으로 막는다 —
# 여기 나오는 회차가 곧 rollback endpoint 가 되살릴 대상이다.
@app.get(
    "/periods/{period_id}/backups",
    response_model=BackupsOut,
    dependencies=[Depends(require_permission("rollback"))],
)
def read_period_backups(
    period_id: int,
    session: Session = Depends(get_session),
) -> BackupsOut:
    if session.get(Period, period_id) is None:
        raise HTTPException(status_code=422, detail="그런 기간이 없습니다")

    rounds = list_backup_rounds(session, period_id)
    return BackupsOut(
        backups=[
            BackupOut(saved_at=round_["saved_at"], slot_count=round_["slot_count"])
            for round_ in rounds
        ]
    )


# 회차 하나를 눌러 그때 시간표를 본다. 목록과 같은 자격으로 막는다 — 목록에서
# 이어지는 화면이라 자격이 갈리면 목록만 보이고 눌러도 안 열린다.
@app.get(
    "/periods/{period_id}/backups/{saved_at}",
    response_model=BackupRoundOut,
    dependencies=[Depends(require_permission("rollback"))],
)
def read_period_backup_round(
    period_id: int,
    saved_at: datetime,
    session: Session = Depends(get_session),
) -> BackupRoundOut:
    if session.get(Period, period_id) is None:
        raise HTTPException(status_code=422, detail="그런 기간이 없습니다")

    rows = session.execute(
        select(AssignmentBackup, Team.name, Room.name)
        .join(Team, Team.id == AssignmentBackup.team_id)
        .join(Room, Room.id == AssignmentBackup.room_id)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at == saved_at)
        .order_by(AssignmentBackup.starts_at, Room.name)
    ).all()
    # 칸이 하나도 없는 회차는 애초에 저장되지 않는다. 빈 결과는 "그런 회차가 없다"는
    # 뜻이므로, 빈 시간표를 돌려주는 대신 거절한다.
    if not rows:
        raise HTTPException(status_code=422, detail="그런 회차가 없습니다")

    return BackupRoundOut(
        rows=[
            ScheduleRowOut(
                team_id=backup.team_id,
                team=team_name,
                room_id=backup.room_id,
                room=room_name,
                start=backup.starts_at,
                end=backup.ends_at,
            )
            for backup, team_name, room_name in rows
        ]
    )


@app.post(
    "/periods/{period_id}/rollback",
    response_model=RollbackOut,
    dependencies=[Depends(require_permission("rollback"))],
)
def rollback_period_schedule(
    period_id: int,
    session: Session = Depends(get_session),
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

    # 되돌리기도 사람이 보는 시간표를 바꾼다. 되돌릴 백업이 없어 아무것도 안 바뀐
    # 경우(False)에는 알리지 않는다.
    if rolled_back:
        notify_assignment_updated(session, period_id, datetime.now())
    return RollbackOut(rolled_back=rolled_back)


# 개발용 — 프로토타입 화면을 API 와 같은 출처로 내보낸다. 출처가 같아야 화면의
# fetch 가 CORS 에 막히지 않는다. PROTOTYPE_DIR 이 실제 폴더를 가리킬 때만 붙으므로
# 그 환경변수가 없는 배포에서는 이 mount 가 아예 생기지 않는다.
_prototype_dir = os.environ.get("PROTOTYPE_DIR")
if _prototype_dir and os.path.isdir(_prototype_dir):
    app.mount(
        "/proto",
        StaticFiles(directory=_prototype_dir, html=True),
        name="prototypes",
    )
