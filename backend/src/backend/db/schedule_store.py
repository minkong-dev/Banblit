from datetime import datetime
from typing import TypedDict

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.db.commit import commit_translating
from backend.db.models import Assignment, AssignmentBackup

BACKUP_KEEP = 2  # 남길 백업 회차 수. 하루 2회 연산 = 하루치.


class AssignmentRow(TypedDict):
    """저장할 배정 slot(1시간 단위 시간 칸) 하나입니다. 항목 이름은 이 곳에만 정의합니다.

    두 곳에 정의하면 한쪽 이름을 변경해도 Python 이 검사하지 못합니다.
    실제 table 의 칼럼은 backend/db/models.py 의 Assignment 가 정의합니다.
    """

    team_id: int
    room_id: int
    starts_at: datetime
    ends_at: datetime

class ScheduleConflict(ValueError):
    """이미 차 있는 합주실·시간에 저장하려 했을 때 발생합니다.

    ValueError 를 상속받아 부르는 쪽이 잘못된 입력과 같은 위치에서 처리할 수 있습니다.
    """


# 위반될 수 있는 제약과 그때 사용자에게 표시할 문장입니다. "다른 회차가 같은 합주실·시간을 사용하는 경우"와
# "같은 회차를 동시에 두 번 저장하는 경우"가 같은 제약에 위반되어 문장이 둘을 모두 포함합니다.
SCHEDULE_MESSAGES = {
    "assignments_room_id_starts_at_key": (
        "다른 기간이거나 같은 기간의 동시 실행이 이미 같은 합주실의 같은 시간을 "
        "쓰고 있습니다. 기간이 겹치지 않게 하거나 합주실을 나누십시오"
    ),
}


def save_schedule(
    session: Session,
    period_id: int,
    rows: list[AssignmentRow],
    saved_at: datetime,
) -> None:
    """그 기간의 현행 배정을 새 배정으로 교체합니다.

    교체 전 현행 배정을 saved_at 도장과 함께 백업으로 보관합니다.
    rows 의 항목은 AssignmentRow 가 정의합니다. commit 까지 이 함수에서 처리합니다.
    이미 차 있는 합주실·시간이면 ScheduleConflict(ValueError)를 발생시킵니다.
    """
    def write() -> None:
        # _archive_current 가 delete 보다 먼저여야 합니다. 순서를 뒤집으면 현행이 삭제된 후에
        # 복사되어 백업이 완전히 비게 됩니다.
        _archive_current(session, period_id, saved_at)
        session.execute(delete(Assignment).where(Assignment.period_id == period_id))
        for row in rows:
            session.add(Assignment(period_id=period_id, **row))
        # _prune_backups 는 새로운 회차가 추가된 후에 계산해야 회차 개수가 정확합니다.
        _prune_backups(session, period_id)
        session.commit()

    # 쓰기 중 자동 flush 와 마지막 commit 이 같은 제약에 위반될 수 있으므로 한 곳에서 처리합니다.
    commit_translating(session, SCHEDULE_MESSAGES, write, ScheduleConflict)


def _archive_current(session: Session, period_id: int, saved_at: datetime) -> None:
    current = session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    for a in current:
        session.add(
            AssignmentBackup(
                period_id=a.period_id,
                team_id=a.team_id,
                room_id=a.room_id,
                starts_at=a.starts_at,
                ends_at=a.ends_at,
                saved_at=saved_at,
            )
        )


def _prune_backups(session: Session, period_id: int) -> None:
    saved_times = session.scalars(
        select(AssignmentBackup.saved_at)
        .where(AssignmentBackup.period_id == period_id)
        .distinct()
        .order_by(AssignmentBackup.saved_at.desc())
    ).all()
    keep = saved_times[:BACKUP_KEEP]
    session.execute(
        delete(AssignmentBackup)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at.notin_(keep))
    )


class BackupRound(TypedDict):
    """백업 회차 하나입니다. saved_at 이 회차를 식별하는 값이고, slot_count 는 그 회차의 slot(1시간 단위 시간 칸) 개수입니다.

    assignment_backups table 에는 회차 번호 칼럼이 없습니다. 한 번의 저장에서
    보관된 줄들이 같은 saved_at 도장을 공유합니다.
    """

    saved_at: datetime
    slot_count: int


def list_backup_rounds(session: Session, period_id: int) -> list[BackupRound]:
    """그 기간의 백업 회차를 최신순으로 반환합니다. 사용자가 되돌릴 회차를 선택하는 목록입니다."""
    rows = session.execute(
        select(AssignmentBackup.saved_at, func.count())
        .where(AssignmentBackup.period_id == period_id)
        .group_by(AssignmentBackup.saved_at)
        .order_by(AssignmentBackup.saved_at.desc())
    ).all()
    return [
        BackupRound(saved_at=saved_at, slot_count=slot_count)
        for saved_at, slot_count in rows
    ]


def rollback_schedule(session: Session, period_id: int) -> bool:
    """가장 최근 백업 회차를 현행으로 복원하고 그 회차를 삭제합니다.

    되돌릴 백업이 없으면 변경하지 않고 False 를 반환합니다. commit 까지 이 함수에서 처리합니다.
    """
    latest = session.scalar(
        select(AssignmentBackup.saved_at)
        .where(AssignmentBackup.period_id == period_id)
        .order_by(AssignmentBackup.saved_at.desc())
        .limit(1)
    )
    if latest is None:
        return False

    def write() -> None:
        session.execute(delete(Assignment).where(Assignment.period_id == period_id))
        batch = session.scalars(
            select(AssignmentBackup)
            .where(AssignmentBackup.period_id == period_id)
            .where(AssignmentBackup.saved_at == latest)
        ).all()
        for b in batch:
            session.add(
                Assignment(
                    period_id=b.period_id,
                    team_id=b.team_id,
                    room_id=b.room_id,
                    starts_at=b.starts_at,
                    ends_at=b.ends_at,
                )
            )
        # 복원한 회차는 삭제합니다. 남겨두면 같은 회차로 두 번 복원할 수 있기 때문입니다.
        session.execute(
            delete(AssignmentBackup)
            .where(AssignmentBackup.period_id == period_id)
            .where(AssignmentBackup.saved_at == latest)
        )
        session.commit()

    commit_translating(session, SCHEDULE_MESSAGES, write, ScheduleConflict)
    return True
