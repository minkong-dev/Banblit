"""확정 스케줄과 밀려난 회차(backup round)를 조회하는 module입니다. 라우터는 여기서 반환된 행에 이름만 추가하여 응답합니다."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup, Period, Room, Team

ScheduleRow = tuple[int, str, int, str, datetime, datetime]
"""(팀 id, 팀 이름, 합주실 id, 합주실 이름, 시작 시각, 종료 시각)"""


def get_period_or_raise(session: Session, period_id: int) -> Period:
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("그런 기간이 없습니다")
    return period


def list_schedule(session: Session, period_id: int) -> list[ScheduleRow]:
    """그 기간의 확정 배정을 시작 시각과 합주실 이름 순으로 반환합니다."""
    rows = session.execute(
        select(Assignment, Team.name, Room.name)
        .join(Team, Team.id == Assignment.team_id)
        .join(Room, Room.id == Assignment.room_id)
        .where(Assignment.period_id == period_id)
        .order_by(Assignment.starts_at, Room.name)
    ).all()
    return [
        (a.team_id, team_name, a.room_id, room_name, a.starts_at, a.ends_at)
        for a, team_name, room_name in rows
    ]


def list_backup_round(session: Session, period_id: int, saved_at: datetime) -> list[ScheduleRow]:
    """밀려난 회차(backup round) 하나의 스케줄을 반환합니다. 회차를 식별하는 값은 저장 시각입니다.

    배정이 하나도 없는 회차는 애초에 저장되지 않습니다. 빈 결과는 "그런 회차가 없다"는
    의미이므로, 빈 스케줄을 반환하는 대신 ValueError를 발생시킵니다.
    """
    rows = session.execute(
        select(AssignmentBackup, Team.name, Room.name)
        .join(Team, Team.id == AssignmentBackup.team_id)
        .join(Room, Room.id == AssignmentBackup.room_id)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at == saved_at)
        .order_by(AssignmentBackup.starts_at, Room.name)
    ).all()
    if not rows:
        raise ValueError("그런 회차가 없습니다")
    return [
        (b.team_id, team_name, b.room_id, room_name, b.starts_at, b.ends_at)
        for b, team_name, room_name in rows
    ]
