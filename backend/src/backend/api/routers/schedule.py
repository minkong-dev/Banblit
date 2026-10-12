"""현재 배정안·배정 계산·스케줄링 기록 endpoint(API의 요청 주소 단위)입니다. 스케줄을 수정하는 endpoint 는 이 모듈에만 있습니다."""

from collections.abc import Callable
from datetime import date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.api.job_runner import Job, JobRunner, max_concurrent_jobs_from_env
from backend.services.notification.pipeline import notify_assignment_updated
from backend.services.settings.pipeline import slot_minutes
from backend.services.period.pipeline import (
    PeriodAssignResult,
    PeriodRun,
    ScheduleReport,
    open_slots_in_period,
    run_period_assignment,
    stored_report,
)
from backend.services.period.pipeline import (
    ScheduleRow,
    get_period_or_raise,
    list_backup_round,
    list_schedule,
)
from backend.api.schemas import (
    AbsenceOut,
    ApplyRecordOut,
    AssignmentOut,
    BackupOut,
    BackupRoundOut,
    BackupsOut,
    JobEnvelopeOut,
    JobOut,
    PeriodAssignIn,
    PeriodAssignOut,
    RoomSlotOut,
    ScheduleOut,
    ScheduleReportOut,
    ScheduleRowOut,
    ShortfallOut,
)
from backend.db.models import Period
from backend.db.pipeline import (
    apply_record,
    get_session,
    get_session_factory,
    list_backup_rounds,
)
from backend.scheduling.pipeline import RoomInterval

router = APIRouter()

# 배정 계산을 접수해 백그라운드 스레드에서 실행합니다. 프로세스에 하나만 둡니다. 요청마다 새로
# 만들면 스레드 풀과 작업 기록이 요청마다 따로 생겨 동시 실행 상한도 작업 조회도 동작하지 않습니다.
job_runner: JobRunner[PeriodRun] = JobRunner(
    max_concurrent=max_concurrent_jobs_from_env()
)

def _period(period_id: int, session: Session = Depends(get_session)) -> Period:
    # 기간 존재 여부는 여러 endpoint(API의 요청 주소 단위)가 동일하게 검증합니다. 없으면 ValueError 를 발생시켜 422 로 응답합니다.
    return get_period_or_raise(session, period_id)


def _row_out(row: ScheduleRow) -> ScheduleRowOut:
    team_id, team, room_id, room, start, end = row
    return ScheduleRowOut(team_id=team_id, team=team, room_id=room_id, room=room, start=start, end=end)


def _report_out(report: ScheduleReport) -> ScheduleReportOut:
    return ScheduleReportOut(
        target_hours=report.target_hours,
        shortfalls=[ShortfallOut(team_id=s.team_id, team=s.team, assigned_hours=s.assigned_hours) for s in report.shortfalls],
        absences=[
            AbsenceOut(
                team_id=a.team_id,
                team=a.team,
                member_id=a.member_id,
                member=a.member,
                cohort=a.cohort,
                position=a.position,
                sessions=a.sessions,
            )
            for a in report.absences
        ],
        over_absent=report.over_absent,
    )


def _stored_report_out(session: Session, period: Period, rows: list[ScheduleRow]) -> ScheduleReportOut | None:
    report = stored_report(session, period, rows, date.today())
    return None if report is None else _report_out(report)


@router.get(
    "/periods/{period_id}/schedule",
    response_model=ScheduleOut,
    dependencies=[Depends(require_account)],
)
def read_schedule(
    period: Period = Depends(_period), session: Session = Depends(get_session)
) -> ScheduleOut:
    # 예약 가능한 slot(점유 단위 길이의 시간 칸)을 스케줄과 같은 응답에 포함합니다. 화면은 open_slots 만 보고 예약 가능한
    # 시간을 표시합니다. 따로 요청하게 두면 배정 계산을 다시 실행하는 endpoint 가 필요해집니다.
    rows = list_schedule(session, period.id)
    return ScheduleOut(
        rows=[_row_out(row) for row in rows],
        open_slots=[
            RoomSlotOut(room_id=slot.room_id, room=slot.room, start=slot.start, end=slot.end)
            for slot in open_slots_in_period(session, period, date.today())
        ],
        report=_stored_report_out(session, period, rows),
    )


def _assignment_out(result: PeriodAssignResult) -> AssignmentOut:
    # 엔진이 사용한 번호가 바로 DB의 번호입니다. 이름만 대응표에서 찾아 붙입니다.
    def to_slot(room_interval: RoomInterval) -> RoomSlotOut:
        return RoomSlotOut(
            room_id=room_interval.room_id,
            room=result.room_names[room_interval.room_id],
            start=room_interval.interval.start,
            end=room_interval.interval.end,
        )

    # 응답의 slots_by_team 한 항목은 session(합주 1회가 이어지는 구간) 1회입니다. 화면이 쓰는
    # field 이름이므로 그대로 둡니다.
    slots_by_team: dict[str, list[RoomSlotOut]] = {}
    for team_id, sessions in result.assignment.sessions_by_team.items():
        slots_by_team[result.team_names[team_id]] = [
            to_slot(room_session) for room_session in sessions
        ]

    return AssignmentOut(
        slots_by_team=slots_by_team,
        open_slots=[to_slot(slot) for slot in result.assignment.open_slots],
    )


def _result_out(run: PeriodRun) -> PeriodAssignOut:
    return PeriodAssignOut(
        assignment=_assignment_out(run.computed),
        report=_report_out(run.report),
        record_saved_at=run.record_saved_at,
    )


def _job_out(job: Job[PeriodRun]) -> JobOut:
    return JobOut(
        id=job.id,
        period_id=job.period_id,
        status=job.status,
        requested_at=job.requested_at,
        finished_at=job.finished_at,
        result=_result_out(job.result) if job.result is not None else None,
        error=job.error,
    )


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
    # 팀·합주실 존재 여부나 배정 계산 자체는 접수를 거절할 이유가 아니라 백그라운드 작업의
    # 실패 원인이므로 compute 안에서 처리합니다.
    def compute() -> PeriodRun:
        # 요청을 받은 스레드의 session 을 그대로 전달하지 않습니다. SQLAlchemy Session 은
        # 스레드끼리 공유하면 안 되므로, 백그라운드 스레드 전용 session 을 새로 엽니다.
        with session_factory() as job_session:
            # 결과는 기록으로만 쌓습니다(services/period/pipeline.py). 현재 배정안은 apply 로만 바뀝니다.
            return run_period_assignment(
                job_session, period.id, req.team_ids, req.room_ids, saved_at=datetime.now()
            )

    return JobEnvelopeOut(job=_job_out(job_runner.submit(period.id, compute)))


# 응답에는 계산 결과와 부족분·불참자 보고가 포함됩니다. assign_read 권한이 조회합니다.
@router.get(
    "/jobs/{job_id}",
    response_model=JobEnvelopeOut,
    dependencies=[Depends(require_permission("assign_read"))],
)
def read_job(job_id: str) -> JobEnvelopeOut:
    job = job_runner.get(job_id)
    if job is None:
        raise ValueError("존재하지 않는 작업입니다")
    return JobEnvelopeOut(job=_job_out(job))


# 스케줄링 기록 목록입니다. 기록을 보고 적용하는 권한(proposal_confirm) 하나로 검증합니다(사용자 결정 2026-10-13).
@router.get(
    "/periods/{period_id}/backups",
    response_model=BackupsOut,
    dependencies=[Depends(require_permission("proposal_confirm"))],
)
def read_period_backups(
    period: Period = Depends(_period), session: Session = Depends(get_session)
) -> BackupsOut:
    return BackupsOut(
        backups=[
            BackupOut(saved_at=round_["saved_at"], slot_count=round_["slot_count"])
            # 칸 수는 구간 길이를 칸 크기로 나눈 값입니다. 칸 크기는 저장소 설정이 결정합니다.
            for round_ in list_backup_rounds(session, period.id, slot_minutes(session))
        ]
    )


# 스케줄링 기록 하나를 선택해 그 시간표와 보고를 봅니다. 없는 기록은 list_backup_round 가 ValueError 로 거절합니다.
@router.get(
    "/periods/{period_id}/backups/{saved_at}",
    response_model=BackupRoundOut,
    dependencies=[Depends(require_permission("proposal_confirm"))],
)
def read_period_backup_round(
    saved_at: datetime,
    period: Period = Depends(_period),
    session: Session = Depends(get_session),
) -> BackupRoundOut:
    rows = list_backup_round(session, period.id, saved_at)
    return BackupRoundOut(
        rows=[_row_out(row) for row in rows],
        report=_stored_report_out(session, period, rows),
    )


# 스케줄링 기록 하나를 현재 배정안으로 적용합니다. 현재 배정안이 바뀌는 곳은 이 endpoint 하나라 알림도 여기서 남깁니다.
@router.post(
    "/periods/{period_id}/backups/{saved_at}/apply",
    response_model=ApplyRecordOut,
    dependencies=[Depends(require_permission("proposal_confirm"))],
)
def apply_period_record(
    saved_at: datetime,
    period: Period = Depends(_period),
    session: Session = Depends(get_session),
) -> ApplyRecordOut:
    # 합주실·시각 충돌은 ValueError 를 발생시켜 422 로 응답합니다.
    if not apply_record(session, period.id, saved_at):
        raise ValueError("존재하지 않는 배정기록입니다")
    notify_assignment_updated(session, period.id, datetime.now())
    return ApplyRecordOut(applied=True)
