from datetime import datetime
from typing import NoReturn, TypedDict

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup

BACKUP_KEEP = 2  # 남길 백업 회차 수. 하루 2회 연산 = 하루치.


class AssignmentRow(TypedDict):
    """저장할 배정 한 칸. 항목 이름은 여기 한 곳에만 적는다.

    두 곳에 각각 적으면 한쪽 이름을 바꿔도 파이썬이 잡아주지 못한다.
    실제 표의 칼럼은 backend/db/models.py 의 Assignment 가 정의한다.
    """

    team_id: int
    room_id: int
    starts_at: datetime
    ends_at: datetime

# assignments 테이블의 (room_id, starts_at) 유니크 제약 이름.
_ROOM_TIME_CONFLICT_CONSTRAINT = "assignments_room_id_starts_at_key"


class ScheduleConflict(ValueError):
    """이미 차 있는 방·시각에 저장하려 했다는 뜻.

    ValueError 를 물려받아, 부르는 쪽이 잘못된 입력과 같은 자리에서 잡을 수 있다.
    """


def conflict_message_for(error: IntegrityError) -> str | None:
    # error.orig.diag.constraint_name 이 방·시각 유니크 제약이면 사용자용 문장을,
    # 아니면 None 을 돌려준다. None 이면 부르는 쪽이 원래 예외를 그대로 올린다.
    orig = error.orig
    diag = getattr(orig, "diag", None)
    constraint_name = getattr(diag, "constraint_name", None)
    if constraint_name != _ROOM_TIME_CONFLICT_CONSTRAINT:
        return None
    return (
        "다른 기간이거나 같은 기간의 동시 실행이 이미 같은 합주실의 같은 시간을 "
        "쓰고 있습니다. 기간이 겹치지 않게 하거나 합주실을 나누십시오"
    )


def _raise_translated(session: Session, error: IntegrityError) -> NoReturn:
    # 쓰다 만 것을 되돌리고, 방·시각 충돌이면 ScheduleConflict 로 바꿔 올린다.
    # 원인이 다르면 원래 예외를 그대로 올려 500으로 드러나게 둔다.
    session.rollback()
    message = conflict_message_for(error)
    if message is None:
        raise error
    raise ScheduleConflict(message) from error


def commit_schedule(session: Session) -> None:
    # session.commit 으로 저장을 확정한다. 확정 시점에 제약이 걸리는 경우를 받는다.
    try:
        session.commit()
    except IntegrityError as error:
        _raise_translated(session, error)


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
    try:
        # _archive_current 가 delete 보다 먼저다. 뒤집으면 현행이 지워진 뒤에
        # 복사하게 되어 백업이 통째로 빈다.
        _archive_current(session, period_id, saved_at)
        session.execute(delete(Assignment).where(Assignment.period_id == period_id))
        for row in rows:
            session.add(Assignment(period_id=period_id, **row))
        # _prune_backups 는 새 회차가 쌓인 뒤에 세어야 회차 수가 맞는다.
        _prune_backups(session, period_id)
    except IntegrityError as error:
        # 쓰는 도중 자동 flush 로 제약이 걸리는 경우를 여기서 받는다.
        _raise_translated(session, error)
    commit_schedule(session)


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
    if not keep:
        # keep이 비면 notin_([])이 항상 참이 되어 그 기간의 백업이 통째로 지워진다 — 방어.
        return
    session.execute(
        delete(AssignmentBackup)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at.notin_(keep))
    )


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

    try:
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
    except IntegrityError as error:
        _raise_translated(session, error)
    commit_schedule(session)
    return True
