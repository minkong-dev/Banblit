# period 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api, jobs 와 다른 service 모듈은 이 모듈 안의 다른 파일을 직접 import 하지 않고
# 이 파일만 참조합니다.
from datetime import date, datetime

from sqlalchemy.orm import Session

from backend.db.models import Period
from backend.db.pipeline import AssignmentRow, apply_record, save_record
from backend.services.notification.pipeline import notify_assignment_updated, notify_everyone
from backend.services.period.close_service import (
    is_closed,
    periods_to_fix,
    require_naive_close,
    require_not_closed,
    require_not_fixed,
    require_unavailable_open,
    unfix_period,
)
from backend.services.period.ensemble_service import (
    days_by_period,
    delete_ensemble,
    delete_ensemble_day,
    set_ensemble,
    set_ensemble_day,
)
from backend.services.period.period_crud_service import (
    ScheduleRow,
    AssignRuleInput,
    WindowInput,
    create_period,
    delete_period,
    every_team_and_room,
    focused_periods_on,
    get_period_or_raise,
    list_backup_round,
    list_periods,
    list_schedule,
    update_period,
)
from backend.services.period.period_service import (
    Absence,
    PeriodAssignResult,
    PeriodRun,
    ScheduleReport,
    Shortfall,
    assign_period,
    assignment_rows,
    due_slots,
    mark_ran,
    open_slots_in_period,
    period_days,
    ran_slots_today,
)
from backend.services.period.period_service import schedule_report as _schedule_report
from backend.services.period.period_service import stored_report as _stored_report

# session 1회에서 불참 1명당 감점입니다(사용자 결정 2026-10-16). record_points 가 점수에서 뺍니다.
ABSENCE_PENALTY = 1


def schedule_report(
    session: Session,
    period_id: int,
    team_ids: list[int],
    room_ids: list[int],
    rows: list[AssignmentRow],
    on: date,
) -> ScheduleReport:
    """시간표 rows 의 부족분, 불참자, 점수 보고입니다. 감점은 ABSENCE_PENALTY 입니다."""
    return _schedule_report(session, period_id, team_ids, room_ids, rows, on, ABSENCE_PENALTY)


def stored_report(session: Session, period: Period, rows: list[ScheduleRow], on: date) -> ScheduleReport | None:
    """저장된 시간표의 보고입니다. 감점은 ABSENCE_PENALTY 입니다."""
    return _stored_report(session, period, rows, on, ABSENCE_PENALTY)


def run_period_assignment(
    session: Session,
    period_id: int,
    team_ids: list[int],
    room_ids: list[int],
    saved_at: datetime,
) -> PeriodRun:
    """배정을 계산해 스케줄링 기록으로 저장합니다. 현재 배정안은 변경하지 않고 알리지도 않습니다(사용자 결정 2026-10-13).

    현재 배정안은 관리자가 기록을 적용할 때만 변경됩니다(api 의 apply_period_record).
    수동 실행(api)과 자동 실행(jobs)이 이 함수를 호출합니다. saved_at 은 스케줄링 기록을 식별하는 저장 시각입니다.
    everyday 기간의 배정 날짜는 assign_period 가 saved_at.date() 로 계산합니다.
    """
    computed = assign_period(session, period_id, team_ids, room_ids, saved_at)
    rows = assignment_rows(computed.assignment)
    # 엔진의 absences 가 아니라 저장된 시간표를 볼 때와 같은 함수로 계산합니다. 같은 시간표의 보고가 화면마다 달라지지 않게 합니다.
    report = schedule_report(session, period_id, team_ids, room_ids, rows, saved_at.date())
    # ponytail: 모든 팀이 0회면 rows 가 비어 기록이 남지 않으므로 record_saved_at 은 None 입니다.
    # 자리가 하나도 없는 기간이라 화면은 빈 캘린더와 부족분 목록을 보여 주면 됩니다. 기록이 필요해지면 빈 기록 표식을 둡니다.
    if not rows:
        return PeriodRun(computed, report, record_saved_at=None)
    save_record(session, period_id, rows, saved_at=saved_at)
    return PeriodRun(computed, report, record_saved_at=saved_at)


def fix_closed_period(
    session: Session, period: Period, team_ids: list[int], room_ids: list[int], now: datetime
) -> None:
    """마감 일시가 지난 period 를 마지막 불가능 일정으로 1회 계산해 현재 배정안으로 적용하고 확정한 뒤, 전체 멤버에게 알립니다(사용자 결정 2026-10-20).

    배정할 날짜가 없거나 계산 결과가 비면 적용 없이 확정만 합니다.
    """
    # 확정 뒤에는 기록 적용을 받지 않으므로 계산 결과를 관리자 확인 없이 바로 적용합니다.
    if period_days(period, now.date()):
        run = run_period_assignment(session, period.id, team_ids, room_ids, saved_at=now)
        if run.record_saved_at is not None:
            apply_record(session, period.id, run.record_saved_at, applied_at=now)
    # 확정 일시와 확정 알림을 배정 적용과 같은 commit 1회로 저장합니다.
    period.fixed_at = now
    notify_everyone(session, "assignment_fixed", now)
    session.commit()


def apply_saved_record(session: Session, period: Period, saved_at: datetime, now: datetime) -> None:
    """스케줄링 기록 1개(saved_at)를 period 의 현재 배정안으로 적용하고 알립니다. 존재하지 않는 기록이면 ValueError 를 발생시킵니다."""
    # 확정된 기간은 적용 전에 거절합니다. 적용 뒤에 검사하면 확정 뒤의 배정안이 변경됩니다.
    require_not_fixed(period)
    # 합주실, 시각 충돌은 apply_record 가 ValueError 를 발생시킵니다. 적용 시각과 알림 시각은 같은 now 입니다.
    if not apply_record(session, period.id, saved_at, applied_at=now):
        raise ValueError("존재하지 않는 배정기록이에요")
    # 현재 배정안을 변경하는 자리는 이 함수와 fix_closed_period 2곳이고, 관리자 적용은 이 함수만이라 알림도 여기서 생성합니다.
    notify_assignment_updated(session, period.id, now)


__all__ = [
    "apply_saved_record",
    "fix_closed_period",
    "is_closed",
    "periods_to_fix",
    "require_naive_close",
    "require_not_closed",
    "require_not_fixed",
    "require_unavailable_open",
    "unfix_period",
    "every_team_and_room",
    "focused_periods_on",
    "days_by_period",
    "delete_ensemble",
    "delete_ensemble_day",
    "set_ensemble",
    "set_ensemble_day",
    "AssignRuleInput",
    "WindowInput",
    "create_period",
    "delete_period",
    "list_periods",
    "update_period",
    "Absence",
    "PeriodAssignResult",
    "PeriodRun",
    "ScheduleReport",
    "Shortfall",
    "assign_period",
    "assignment_rows",
    "open_slots_in_period",
    "period_days",
    "due_slots",
    "mark_ran",
    "ran_slots_today",
    "run_period_assignment",
    "schedule_report",
    "stored_report",
    "ABSENCE_PENALTY",
    "ScheduleRow",
    "get_period_or_raise",
    "list_backup_round",
    "list_schedule",
]
