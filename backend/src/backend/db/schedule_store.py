from datetime import datetime
from typing import TypedDict

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.db.commit import commit_translating
from backend.db.models import Assignment, AssignmentBackup

BACKUP_KEEP = 2  # 남길 백업 회차 수. 하루 2회 연산 = 하루치.


class AssignmentRow(TypedDict):
    """저장할 배정 한 slot. 항목 이름은 여기 한 곳에만 적는다.

    두 곳에 각각 적으면 한쪽 이름을 바꿔도 파이썬이 잡아주지 못한다.
    실제 table 의 칼럼은 backend/db/models.py 의 Assignment 가 정의한다.
    """

    team_id: int
    room_id: int
    starts_at: datetime
    ends_at: datetime

class ScheduleConflict(ValueError):
    """이미 차 있는 방·시각에 저장하려 했다는 뜻.

    ValueError 를 물려받아, 부르는 쪽이 잘못된 입력과 같은 곳에서 잡을 수 있다.
    """


# 걸릴 수 있는 제약과 그때 사람에게 보일 문장. "다른 기간이 같은 방·시각을 쓰는 경우"와
# "같은 기간을 동시에 두 번 저장하는 경우"가 같은 제약에 걸려 문장이 둘을 다 담는다.
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
    """그 기간의 현행 배정을 새 배정으로 교체한다.

    교체 전, 기존 현행은 saved_at 도장을 찍어 백업으로 옮긴다.
    rows 의 항목은 AssignmentRow 가 정한다. 확정까지 여기서 한다.
    이미 차 있는 방·시각이면 ScheduleConflict(ValueError)를 올린다.
    """
    def write() -> None:
        # _archive_current 가 delete 보다 먼저다. 뒤집으면 현행이 지워진 뒤에
        # 복사하게 되어 백업이 통째로 빈다.
        _archive_current(session, period_id, saved_at)
        session.execute(delete(Assignment).where(Assignment.period_id == period_id))
        for row in rows:
            session.add(Assignment(period_id=period_id, **row))
        # _prune_backups 는 새 회차가 쌓인 뒤에 세어야 회차 수가 맞는다.
        _prune_backups(session, period_id)
        session.commit()

    # 쓰는 도중의 자동 flush 와 마지막 commit 이 같은 제약에 걸릴 수 있어 한 자리에서 받는다.
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
    """백업 한 회차. saved_at 이 회차를 가르는 값이고, slot_count 는 그 회차의 slot 수다.

    회차 번호를 따로 두는 칼럼은 assignment_backups 에 없다 — 한 번의 저장에서
    옮겨진 줄들이 같은 saved_at 도장을 나눠 가진다.
    """

    saved_at: datetime
    slot_count: int


def list_backup_rounds(session: Session, period_id: int) -> list[BackupRound]:
    """그 기간의 백업 회차를 최신순으로 돌려준다. 되돌릴 회차를 고르는 목록이다."""
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
    """가장 최근 백업 회차를 현행으로 되돌리고 그 회차를 지운다.

    되돌릴 백업이 없으면 아무것도 바꾸지 않고 False를 돌려준다. 확정까지 여기서 한다.
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
        # 되돌린 회차는 지운다. 남겨두면 같은 회차로 두 번 되돌아간다.
        session.execute(
            delete(AssignmentBackup)
            .where(AssignmentBackup.period_id == period_id)
            .where(AssignmentBackup.saved_at == latest)
        )
        session.commit()

    commit_translating(session, SCHEDULE_MESSAGES, write, ScheduleConflict)
    return True
