from datetime import datetime
from typing import TypedDict

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.db.commit import commit_translating
from backend.db.models import Assignment, AssignmentBackup

BACKUP_KEEP = 2  # 남길 백업 배정기록 수입니다. 하루 2회 계산하므로 하루치입니다.


class AssignmentRow(TypedDict):
    """저장할 배정 구간 하나입니다. 항목 이름은 이 class 에만 정의합니다.

    두 곳에 정의하면 한쪽 이름을 변경해도 Python 이 검사하지 못합니다.
    실제 table 의 열은 backend/db/models.py 의 Assignment 가 정의합니다.

    배정 계산은 칸 하나씩 넘기고, save_schedule 이 이어진 칸을 한 구간으로 합쳐 저장합니다.
    """

    team_id: int
    room_id: int
    starts_at: datetime
    ends_at: datetime


def merge_runs(rows: list[AssignmentRow]) -> list[AssignmentRow]:
    """같은 팀이 같은 합주실에서 이어 쓰는 칸을 한 구간으로 합쳐 반환합니다.

    앞 칸의 ends_at 과 뒤 칸의 starts_at 이 같으면 이어진 것입니다. 사이가 떨어져 있으면
    합치지 않습니다. 합치면 배정받지 않은 시간까지 점유한 것이 됩니다.
    입력을 수정하지 않고 새 목록을 반환합니다.
    """
    merged: list[AssignmentRow] = []
    for row in sorted(rows, key=lambda one: (one["team_id"], one["room_id"], one["starts_at"])):
        last = merged[-1] if merged else None
        joins = (
            last is not None
            and last["team_id"] == row["team_id"]
            and last["room_id"] == row["room_id"]
            and last["ends_at"] == row["starts_at"]
        )
        if joins and last is not None:
            merged[-1] = {**last, "ends_at": row["ends_at"]}
        else:
            merged.append(dict(row))  # type: ignore[arg-type]
    return merged


class ScheduleConflict(ValueError):
    """이미 배정된 합주실·시각에 저장하려 했을 때 발생합니다.

    ValueError 를 상속받아 호출자가 잘못된 입력과 같은 위치에서 처리할 수 있습니다.
    """


# 위반될 수 있는 제약과 그때 사용자에게 표시할 문장입니다. "다른 배정기록이 같은 합주실·시간을 사용하는 경우"와
# "같은 배정기록을 동시에 두 번 저장하는 경우"가 같은 제약에 위반되어 문장이 둘을 모두 포함합니다.
SCHEDULE_MESSAGES = {
    "assignments_no_overlap": (
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

    교체 전 현행 배정을 saved_at 값과 함께 백업으로 보관합니다.
    rows 의 항목은 AssignmentRow 가 정의합니다. commit 까지 이 함수에서 처리합니다.
    이미 배정된 합주실·시각이면 ScheduleConflict(ValueError)를 발생시킵니다.
    """
    def write() -> None:
        # _archive_current 가 delete 보다 먼저여야 합니다. 순서를 뒤집으면 현행이 삭제된 후에
        # 복사되어 백업이 완전히 비게 됩니다.
        _archive_current(session, period_id, saved_at)
        session.execute(delete(Assignment).where(Assignment.period_id == period_id))
        # 이어진 칸을 합친 뒤에 저장합니다. 겹침 금지 제약은 합친 구간을 기준으로 판정합니다.
        for row in merge_runs(rows):
            session.add(Assignment(period_id=period_id, **row))
        # _prune_backups 는 새로운 배정기록이 추가된 후에 계산해야 배정기록 개수가 정확합니다.
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
    """백업 배정기록 하나입니다. saved_at 이 배정기록을 식별하는 값이고, slot_count 는 그 배정기록이
    차지한 칸 수입니다.

    행 수가 아니라 칸 수입니다. 행 하나가 이어진 칸 여러 개를 담으므로(merge_runs), 행을 세면
    같은 배정이 점유 단위에 따라 다른 수로 보입니다.

    assignment_backups table 에는 배정기록 번호 열이 없습니다. 한 번의 저장에서
    보관된 행들이 같은 saved_at 값을 가집니다.
    """

    saved_at: datetime
    slot_count: int


def list_backup_rounds(
    session: Session, period_id: int, slot_minutes: int
) -> list[BackupRound]:
    """그 기간의 백업 배정기록을 최신순으로 반환합니다. 사용자가 되돌릴 배정기록을 선택하는 목록입니다.

    slot_minutes 는 칸 하나의 크기(분)이고 저장소 설정이 결정합니다. 구간의 길이를 그 값으로 나눠
    칸 수를 셉니다. 저장 이후 설정이 변경되었으면 지금 설정 기준의 칸 수가 됩니다.
    """
    # extract(epoch from interval) 은 구간의 길이를 초로 반환합니다. 분으로 변경한 뒤 칸 크기로 나눕니다.
    minutes = func.sum(
        func.extract("epoch", AssignmentBackup.ends_at - AssignmentBackup.starts_at)
    ) / 60
    rows = session.execute(
        select(AssignmentBackup.saved_at, minutes)
        .where(AssignmentBackup.period_id == period_id)
        .group_by(AssignmentBackup.saved_at)
        .order_by(AssignmentBackup.saved_at.desc())
    ).all()
    return [
        BackupRound(saved_at=saved_at, slot_count=round(total / slot_minutes))
        for saved_at, total in rows
    ]


def rollback_schedule(session: Session, period_id: int) -> bool:
    """가장 최근 백업 배정기록을 현행으로 복원하고 그 배정기록을 삭제합니다.

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
        # 복원한 배정기록은 삭제합니다. 남겨두면 같은 배정기록으로 두 번 복원할 수 있기 때문입니다.
        session.execute(
            delete(AssignmentBackup)
            .where(AssignmentBackup.period_id == period_id)
            .where(AssignmentBackup.saved_at == latest)
        )
        session.commit()

    commit_translating(session, SCHEDULE_MESSAGES, write, ScheduleConflict)
    return True
