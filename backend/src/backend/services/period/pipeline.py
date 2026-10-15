# period 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api·jobs와 다른 service 모듈은 이 모듈 안의 다른 파일을 직접 import 하지 않고
# 이 파일만 참조합니다.
from datetime import datetime

from sqlalchemy.orm import Session

from backend.db.pipeline import save_record
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
    """배정을 계산해 스케줄링 기록으로 쌓습니다. 현재 배정안은 바꾸지 않고 알리지도 않습니다(사용자 결정 2026-10-13).

    현재 배정안은 관리자가 기록을 적용할 때만 바뀝니다(api 의 apply_period_record).
    수동 실행(api)과 자동 실행(jobs)이 이 함수 하나를 부릅니다. saved_at 은 저장 시각이자 everyday 기간의 배정 날짜입니다.
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


__all__ = [
    "every_team_and_room",
    "focused_periods_on",
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
    "assignment_rows",
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
