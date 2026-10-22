from datetime import datetime
from typing import TypedDict

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.db.commit import commit_translating
from backend.db.models import Assignment, AssignmentBackup

# 기간마다 남길 스케줄링 기록 수입니다. 자동 연산이 하루 2회(first_run_at, second_run_at)라 10개가 5일치입니다.
RECORD_KEEP = 10


class AssignmentRow(TypedDict):
    """저장할 배정 구간 하나입니다. 항목 이름은 이 class 에만 정의합니다.

    두 곳에 정의하면 한쪽 이름을 변경해도 Python 이 검사하지 못합니다.
    실제 table 의 열은 backend/db/models.py 의 Assignment 가 정의합니다.

    호출자는 slot 또는 session 단위의 구간을 전달하고(services/period/period_service.py 의 assignment_rows 는 session 1회가 행 1개),
    save_schedule 과 save_record 가 이어진 구간을 1개로 합쳐 저장합니다.
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
            # {**last, ...} 는 last 의 항목을 복사한 새 dict 에 ends_at 만 바꾼 것입니다. last 는 변경하지 않습니다.
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
        "쓰고 있어요. 기간이 겹치지 않게 하거나 합주실을 나눠주세요"
    ),
}


def save_schedule(session: Session, period_id: int, rows: list[AssignmentRow]) -> None:
    """그 기간의 현행 배정을 rows 로 교체합니다. 교체 전 현행은 보관하지 않습니다.

    현행은 언제나 스케줄링 기록 하나를 적용한 것이라, 같은 시간표가 기록 목록에 남아 있습니다.
    rows 의 항목은 AssignmentRow 가 정의합니다. commit 까지 이 함수에서 처리합니다.
    이미 배정된 합주실·시각이면 ScheduleConflict(ValueError)를 발생시킵니다.
    """
    def write() -> None:
        session.execute(delete(Assignment).where(Assignment.period_id == period_id))
        # 이어진 칸을 합친 뒤에 저장합니다. 겹침 금지 제약은 합친 구간을 기준으로 판정합니다.
        for row in merge_runs(rows):
            session.add(Assignment(period_id=period_id, **row))
        session.commit()

    # 쓰기 중 자동 flush 와 마지막 commit 이 같은 제약에 위반될 수 있으므로 한 곳에서 처리합니다.
    commit_translating(session, SCHEDULE_MESSAGES, write, ScheduleConflict)


def save_record(
    session: Session,
    period_id: int,
    rows: list[AssignmentRow],
    saved_at: datetime,
) -> None:
    """rows 를 현행으로 바꾸지 않고 스케줄링 기록으로만 쌓습니다. commit 까지 이 함수에서 처리합니다.

    기록 table 에는 겹침 금지 제약이 없으므로 ScheduleConflict 가 발생하지 않습니다.
    """
    for row in merge_runs(rows):
        session.add(AssignmentBackup(period_id=period_id, saved_at=saved_at, **row))
    _prune_backups(session, period_id)
    session.commit()


def _prune_backups(session: Session, period_id: int) -> None:
    # 새로 추가한 행을 아래 조회가 세도록 먼저 DB 에 보냅니다.
    session.flush()
    saved_times = session.scalars(
        select(AssignmentBackup.saved_at)
        .where(AssignmentBackup.period_id == period_id)
        .distinct()
        .order_by(AssignmentBackup.saved_at.desc())
    ).all()
    session.execute(
        delete(AssignmentBackup)
        .where(AssignmentBackup.period_id == period_id)
        # saved_times 는 최신순이라 [:RECORD_KEEP] 이 남길 기록이고, 그 밖의 saved_at 을 가진 행(오래된 기록)을 삭제합니다.
        .where(AssignmentBackup.saved_at.notin_(saved_times[:RECORD_KEEP]))
    )


class BackupRound(TypedDict):
    """스케줄링 기록 하나입니다. saved_at 이 기록을 식별하는 값이고, slot_count 는 그 기록이
    차지한 칸 수입니다.

    행 수가 아니라 칸 수입니다. 행 하나가 이어진 칸 여러 개를 담으므로(merge_runs), 행을 세면
    같은 배정이 점유 단위에 따라 다른 수로 보입니다.

    assignment_backups table 에는 기록 번호 열이 없습니다. 연산 1회의 행들이 같은 saved_at 값을 가집니다.
    """

    saved_at: datetime
    slot_count: int
    # 마지막으로 적용한 시각입니다. 적용한 적 없으면 None 입니다.
    applied_at: datetime | None


def list_backup_rounds(
    session: Session, period_id: int, slot_minutes: int
) -> list[BackupRound]:
    """그 기간의 스케줄링 기록을 최신순으로 반환합니다. 사용자가 보거나 적용할 기록을 선택하는 목록입니다.

    slot_minutes 는 slot 1개의 크기(분)이고 settings table 의 값입니다. 구간 길이를 slot_minutes 로 나눠
    slot 수를 셉니다. 저장 이후 설정이 변경되었으면 현재 설정 기준의 slot 수를 반환합니다.
    """
    # extract(epoch from interval) 은 구간의 길이를 초로 반환합니다. 분으로 변경한 뒤 칸 크기로 나눕니다.
    minutes = func.sum(
        func.extract("epoch", AssignmentBackup.ends_at - AssignmentBackup.starts_at)
    ) / 60
    rows = session.execute(
        select(AssignmentBackup.saved_at, minutes, func.max(AssignmentBackup.applied_at))
        .where(AssignmentBackup.period_id == period_id)
        .group_by(AssignmentBackup.saved_at)
        .order_by(AssignmentBackup.saved_at.desc())
    ).all()
    return [
        BackupRound(saved_at=saved_at, slot_count=round(total / slot_minutes), applied_at=applied_at)
        for saved_at, total, applied_at in rows
    ]


def apply_record(
    session: Session, period_id: int, saved_at: datetime, applied_at: datetime
) -> bool:
    """saved_at 의 스케줄링 기록을 현행으로 복사하고 applied_at 을 확정 시각으로 남깁니다. 기록은 목록에 남아 다시 적용할 수 있습니다.

    applied_at 은 호출자가 전달합니다. 그 기록이 없으면 변경하지 않고 False 를 반환합니다.
    commit 까지 save_schedule 이 처리합니다.
    """
    batch = session.scalars(
        select(AssignmentBackup)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at == saved_at)
    ).all()
    if not batch:
        return False
    for backup in batch:
        backup.applied_at = applied_at
    save_schedule(
        session,
        period_id,
        [
            AssignmentRow(team_id=b.team_id, room_id=b.room_id, starts_at=b.starts_at, ends_at=b.ends_at)
            for b in batch
        ],
    )
    return True
