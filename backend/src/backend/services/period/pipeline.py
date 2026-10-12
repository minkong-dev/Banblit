# period 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api·jobs와 다른 service 모듈은 이 모듈 안의 다른 파일을 직접 import 하지 않고
# 이 파일만 참조합니다.
from datetime import datetime

from sqlalchemy.orm import Session

from backend.db.pipeline import save_record, save_schedule
from backend.services.notification.pipeline import notify_assignment_updated
from backend.services.period.ensemble_service import (
    days_by_period,
    delete_ensemble,
    delete_ensemble_day,
    set_ensemble,
    set_ensemble_day,
)
from backend.services.period.period_crud_service import (
    ScheduleRow,
    AssignRuleIn,
    WindowIn,
    create_period,
    delete_period,
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
    clean,
    open_slots_in_period,
    period_days,
    schedule_report,
    stored_report,
)


def run_period_assignment(
    session: Session,
    period_id: int,
    team_ids: list[int],
    room_ids: list[int],
    saved_at: datetime,
) -> PeriodRun:
    """배정을 계산하고, 부족분과 불참자가 없으면 확정하고 알리며, 있으면 미확정 배정안으로만 등록합니다.

    수동 실행(api)과 자동 실행(jobs)이 이 함수 하나를 부릅니다. saved_at 은 저장 시각이자 everyday 기간의 배정 날짜입니다.
    """
    # 계산만 합니다. 저장 여부는 아래 보고를 보고 정합니다.
    computed = assign_period(session, period_id, team_ids, room_ids, saved_at)
    rows = assignment_rows(computed.assignment)
    # 엔진의 absences 가 아니라 저장된 시간표를 볼 때와 같은 함수로 계산합니다. 같은 시간표의 보고가 화면마다 달라지지 않게 합니다.
    report = schedule_report(session, period_id, team_ids, room_ids, rows, saved_at.date())
    if clean(report):
        # 현행을 이전 확정본으로 보관하고 교체합니다.
        save_schedule(session, period_id, rows, saved_at=saved_at)
        # 확정 시간표가 바뀐 경우에만 알립니다. 알림 대상은 저장된 행에서 찾으므로 저장 뒤에 부릅니다.
        notify_assignment_updated(session, period_id, saved_at)
        return PeriodRun(computed, report, saved=True, record_saved_at=None)
    # ponytail: 모든 팀이 0회면 rows 가 비어 기록이 남지 않고, record_saved_at 이 가리키는 기록도 없습니다.
    # 자리가 하나도 없는 기간이라 화면은 빈 캘린더와 부족분 목록을 보여 주면 됩니다. 기록이 필요해지면 빈 기록 표식을 둡니다.
    # 메인 캘린더는 그대로 둡니다.
    save_record(session, period_id, rows, saved_at=saved_at)
    return PeriodRun(computed, report, saved=False, record_saved_at=saved_at)


__all__ = [
    "days_by_period",
    "delete_ensemble",
    "delete_ensemble_day",
    "set_ensemble",
    "set_ensemble_day",
    "AssignRuleIn",
    "WindowIn",
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
    "open_slots_in_period",
    "period_days",
    "run_period_assignment",
    "schedule_report",
    "stored_report",
    "ScheduleRow",
    "get_period_or_raise",
    "list_backup_round",
    "list_schedule",
]
