"""확정 스케줄·배정 계산·배정기록·되돌리기 endpoint(API의 요청 주소 단위)입니다. 스케줄을 수정하는 endpoint 는 이 모듈에만 있습니다."""

from collections.abc import Callable
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.api.job_runner import Job, JobRunner, max_concurrent_jobs_from_env
from backend.services.notification_service import notify_assignment_updated
from backend.services.settings_service import slot_minutes
from backend.services.period_service import (
    PeriodAssignResult,
    assign_period,
    open_slots_in_period,
)
from backend.services.schedule_service import (
    ScheduleRow,
    get_period_or_raise,
    list_backup_round,
    list_schedule,
)
from backend.api.schemas import (
    AssignmentOut,
    BackupOut,
    BackupRoundOut,
    BackupsOut,
    ExcludedMemberOut,
    JobEnvelopeOut,
    JobOut,
    PeriodAssignIn,
    PeriodAssignOut,
    ProposalOut,
    RollbackOut,
    RoomSlotOut,
    ScheduleOut,
    ScheduleRowOut,
)
from backend.db.models import Period
from backend.db.pipeline import (
    get_session,
    get_session_factory,
    list_backup_rounds,
    rollback_schedule,
)
from backend.scheduling.pipeline import Assignment as EngineAssignment
from backend.scheduling.pipeline import RoomSlot

router = APIRouter()

# 배정 계산을 접수해 백그라운드 스레드에서 실행합니다. 프로세스에 하나만 둡니다. 요청마다 새로
# 만들면 스레드 풀과 작업 기록이 요청마다 따로 생겨 동시 실행 상한도 작업 조회도 동작하지 않습니다.
job_runner: JobRunner[PeriodAssignResult] = JobRunner(
    max_concurrent=max_concurrent_jobs_from_env()
)


def _period(period_id: int, session: Session = Depends(get_session)) -> Period:
    # 기간 존재 여부는 6개 endpoint(API의 요청 주소 단위)가 동일하게 검증합니다. 없으면 ValueError 를 발생시켜 422 로 응답합니다.
    return get_period_or_raise(session, period_id)


def _row_out(row: ScheduleRow) -> ScheduleRowOut:
    team_id, team, room_id, room, start, end = row
    return ScheduleRowOut(team_id=team_id, team=team, room_id=room_id, room=room, start=start, end=end)


@router.get(
    "/periods/{period_id}/schedule",
    response_model=ScheduleOut,
    dependencies=[Depends(require_account)],
)
def read_schedule(
    period: Period = Depends(_period), session: Session = Depends(get_session)
) -> ScheduleOut:
    # 예약 가능한 slot(1시간 단위 시간 칸)을 스케줄과 같은 응답에 포함합니다. 화면은 open_slots 만 보고 예약 가능한
    # 시간을 표시합니다. 따로 요청하게 두면 배정 계산을 다시 실행하는 endpoint 가 필요해집니다.
    return ScheduleOut(
        rows=[_row_out(row) for row in list_schedule(session, period.id)],
        open_slots=[
            RoomSlotOut(room_id=slot.room_id, room=slot.room, start=slot.start, end=slot.end)
            for slot in open_slots_in_period(session, period)
        ],
    )


def _assignment_out(assignment: EngineAssignment, result: PeriodAssignResult) -> AssignmentOut:
    # 엔진이 사용한 번호가 바로 DB의 번호입니다. 이름만 대응표에서 찾아 붙입니다.
    def to_slot(room_slot: RoomSlot) -> RoomSlotOut:
        return RoomSlotOut(
            room_id=room_slot.room_id,
            room=result.room_names[room_slot.room_id],
            start=room_slot.interval.start,
            end=room_slot.interval.end,
        )

    slots_by_team: dict[str, list[RoomSlotOut]] = {}
    for team_id, slots in assignment.slots_by_team.items():
        slots_by_team[result.team_names[team_id]] = [to_slot(slot) for slot in slots]

    return AssignmentOut(
        feasible=assignment.feasible,
        slots_by_team=slots_by_team,
        open_slots=[to_slot(slot) for slot in assignment.open_slots],
    )


def _result_out(result: PeriodAssignResult) -> PeriodAssignOut:
    return PeriodAssignOut(
        saved=result.saved,
        assignment=_assignment_out(result.resolution.assignment, result),
        proposals=[
            ProposalOut(
                excluded_member=ExcludedMemberOut(
                    id=proposal.excluded_member,
                    name=result.member_names[proposal.excluded_member],
                ),
                assignment=_assignment_out(proposal.assignment, result),
            )
            for proposal in result.resolution.proposals
        ],
    )


def _job_out(job: Job[PeriodAssignResult]) -> JobOut:
    return JobOut(
        id=job.id,
        period_id=job.period_id,
        status=job.status,
        requested_at=job.requested_at,
        finished_at=job.finished_at,
        result=_result_out(job.result) if job.result is not None else None,
        error=job.error,
    )


def _submit(
    period: Period,
    req: PeriodAssignIn,
    session_factory: Callable[[], Session],
    excluded_member_id: int | None,
) -> JobEnvelopeOut:
    # 팀·합주실 존재 여부나 배정 계산 자체는 접수를 거절할 이유가 아니라 백그라운드 작업의
    # 실패 원인이므로 compute 안에서 처리합니다.
    def compute() -> PeriodAssignResult:
        # 요청을 받은 스레드의 session 을 그대로 전달하지 않습니다. SQLAlchemy Session 은
        # 스레드끼리 공유하면 안 되므로, 백그라운드 스레드 전용 session 을 새로 엽니다.
        with session_factory() as job_session:
            result = assign_period(
                job_session,
                period.id,
                req.team_ids,
                req.room_ids,
                saved_at=datetime.now(),
                excluded_member_id=excluded_member_id,
            )
            # 저장된 경우에만 알림을 생성합니다. 조율안만 나온 경우에는 저장된 스케줄이 변경되지 않습니다.
            if result.saved:
                notify_assignment_updated(job_session, period.id, datetime.now())
            return result

    return JobEnvelopeOut(job=_job_out(job_runner.submit(period.id, compute)))


@router.post(
    "/periods/{period_id}/assign",
    response_model=JobEnvelopeOut,
    status_code=202,
    dependencies=[Depends(require_permission("assign_run"))],
)
def assign_period_schedule(
    req: PeriodAssignIn,
    period: Period = Depends(_period),
    session_factory: Callable[[], Session] = Depends(get_session_factory),
) -> JobEnvelopeOut:
    return _submit(period, req, session_factory, None)


# 조율안을 확정합니다. 계산 결과는 프로세스 메모리에만 있어 조율안의 배정을 다시 조회할 수
# 없으므로, 조율안이 지목한 멤버를 제외한 채로 다시 계산해 저장합니다. 저장 경로가 assign_period 하나로 유지됩니다.
@router.post(
    "/periods/{period_id}/proposals/{member_id}/confirm",
    response_model=JobEnvelopeOut,
    status_code=202,
    dependencies=[Depends(require_permission("proposal_confirm"))],
)
def confirm_period_proposal(
    member_id: int,
    req: PeriodAssignIn,
    period: Period = Depends(_period),
    session_factory: Callable[[], Session] = Depends(get_session_factory),
) -> JobEnvelopeOut:
    return _submit(period, req, session_factory, member_id)


# 응답에는 계산 결과, 아직 확정되지 않은 조율안, 조율안마다 제외된 멤버가 포함됩니다. assign_read 권한이 조회합니다.
@router.get(
    "/jobs/{job_id}",
    response_model=JobEnvelopeOut,
    dependencies=[Depends(require_permission("assign_read"))],
)
def read_job(job_id: str) -> JobEnvelopeOut:
    job = job_runner.get(job_id)
    if job is None:
        raise ValueError("그런 작업이 없습니다")
    return JobEnvelopeOut(job=_job_out(job))


# 되돌리기할 배정기록을 선택하는 목록입니다. 되돌리기와 같은 권한으로 검증합니다.
@router.get(
    "/periods/{period_id}/backups",
    response_model=BackupsOut,
    dependencies=[Depends(require_permission("rollback"))],
)
def read_period_backups(
    period: Period = Depends(_period), session: Session = Depends(get_session)
) -> BackupsOut:
    return BackupsOut(
        backups=[
            BackupOut(saved_at=round_["saved_at"], slot_count=round_["slot_count"])
            # 칸 수는 구간 길이를 칸 크기로 나눈 값입니다. 칸 크기는 저장소 설정이 정합니다.
            for round_ in list_backup_rounds(session, period.id, slot_minutes(session))
        ]
    )


# 배정기록 하나를 선택해 당시 스케줄을 봅니다. 목록에서 이어지는 화면이므로 같은 권한으로 검증합니다.
@router.get(
    "/periods/{period_id}/backups/{saved_at}",
    response_model=BackupRoundOut,
    dependencies=[Depends(require_permission("rollback"))],
)
def read_period_backup_round(
    saved_at: datetime,
    period: Period = Depends(_period),
    session: Session = Depends(get_session),
) -> BackupRoundOut:
    return BackupRoundOut(rows=[_row_out(row) for row in list_backup_round(session, period.id, saved_at)])


@router.post(
    "/periods/{period_id}/rollback",
    response_model=RollbackOut,
    dependencies=[Depends(require_permission("rollback"))],
)
def rollback_period_schedule(
    period: Period = Depends(_period), session: Session = Depends(get_session)
) -> RollbackOut:
    # rollback_schedule 이 되돌리기와 확정을 함께 완료합니다. 합주실·시각 충돌은 ValueError 를 발생시켜 422 로 응답합니다.
    rolled_back = rollback_schedule(session, period.id)
    # 되돌릴 백업이 없어 아무것도 바뀌지 않은 경우(False)에는 알리지 않습니다.
    if rolled_back:
        notify_assignment_updated(session, period.id, datetime.now())
    return RollbackOut(rolled_back=rolled_back)
