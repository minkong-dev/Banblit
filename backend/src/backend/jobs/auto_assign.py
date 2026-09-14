"""계산 시각이 지난 집중 합주기간의 배정을 자동으로 실행합니다.

서버(api)와 같은 image 를 사용하는 별도 container 로 동작합니다. 서버를 여러 대로 확장해도
이 서비스는 한 대로 유지하므로 같은 계산이 여러 번 실행되지 않습니다. HTTP endpoint 를 거치지 않고
assign_period 를 직접 호출하므로 서버가 실행 중이 아니어도 계산을 수행합니다.
"""

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, time
from time import sleep
from typing import Literal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.api.notification_service import notify_assignment_updated
from backend.api.period_service import assign_period
from backend.db.models import AssignmentRun, Period, Room, Team
from backend.db.pipeline import get_session_factory

logger = logging.getLogger(__name__)

RunSlot = Literal["first", "second"]

DEFAULT_INTERVAL_SECONDS = 60
_ENABLED_VARIABLE = "AUTO_ASSIGN_ENABLED"
_INTERVAL_VARIABLE = "AUTO_ASSIGN_INTERVAL_SECONDS"


@dataclass(frozen=True)
class AutoRun:
    """기간 하나의 자동 배정 결과입니다. slots 는 이번 실행에서 실행한 것으로 기록한 계산 시각 목록입니다."""

    period_id: int
    run_on: date
    slots: tuple[RunSlot, ...]
    saved: bool
    error: str | None


def due_slots(
    period: Period, now: datetime, already_ran: set[str]
) -> tuple[RunSlot, ...]:
    # period 의 두 계산 시각 중 now 까지 지났고 아직 실행하지 않은 시각을 반환합니다.
    # 어제 놓친 시각은 검사하지 않습니다. 배정은 기간 전체를 다시 계산하는 작업이므로 어제 시각을
    # 지금 실행하는 것과 오늘 시각을 지금 실행하는 것은 결과가 같습니다.
    today = now.date()
    schedule: list[tuple[RunSlot, time]] = [
        ("first", period.first_run_at),
        ("second", period.second_run_at),
    ]
    due: list[RunSlot] = []
    for slot, run_at in schedule:
        if slot in already_ran:
            continue
        if datetime.combine(today, run_at) <= now:
            due.append(slot)
    return tuple(due)


def run_due_assignments(session: Session, now: datetime) -> list[AutoRun]:
    """now 기준으로 계산 시각이 지난 기간을 전부 계산하고, 실행한 시각을 assignment_runs table 에 기록합니다.

    한 기간의 계산이 실패해도 다음 기간을 계속 처리합니다. 실패는 로그에 남기고 assignment_runs 에는
    기록하지 않으므로 다음 확인 때 다시 시도합니다. 시각을 인자로 받으므로 테스트가 임의의
    시각을 대입할 수 있습니다.
    """
    today = now.date()
    # 오늘이 기간 안에 포함되는 집중 합주기간만 처리합니다. 상시 기간(kind="open")은 선착순
    # 예약으로 동작하므로 assign_period 가 거절합니다. everyday 가 켜진 기간은 종료일이 없으므로
    # 시작일만 지났으면 매일 처리합니다(사용자 결정 2026-09-11).
    periods = session.scalars(
        select(Period)
        .where(Period.kind == "focused")
        .where(Period.starts_on <= today)
        .where(or_(Period.everyday.is_(True), Period.ends_on >= today))
        .order_by(Period.id)
    ).all()
    if not periods:
        return []

    ran_by_period = _ran_slots_today(session, [period.id for period in periods], today)
    # 사용자가 버튼을 누를 때는 화면이 팀·합주실을 선택해 전송하지만 자동 실행에는 선택할
    # 사람이 없습니다. 등록된 모든 팀과 합주실을 대상으로 실행합니다. 일부만 실행하려면
    # 선택 목록을 저장하는 table(period_rooms 등)을 먼저 추가해야 합니다.
    team_ids = list(session.scalars(select(Team.id).order_by(Team.id)).all())
    room_ids = list(session.scalars(select(Room.id).order_by(Room.id)).all())

    results: list[AutoRun] = []
    for period in periods:
        slots = due_slots(period, now, ran_by_period.get(period.id, set()))
        if not slots:
            continue
        results.append(_run_one(session, period.id, now, slots, team_ids, room_ids))
    return results


def _ran_slots_today(
    session: Session, period_ids: list[int], today: date
) -> dict[int, set[str]]:
    # 오늘 이미 실행한 (기간, 계산 시각)을 기간별 집합으로 수집합니다.
    rows = session.execute(
        select(AssignmentRun.period_id, AssignmentRun.slot)
        .where(AssignmentRun.period_id.in_(period_ids))
        .where(AssignmentRun.run_on == today)
    ).all()
    ran: dict[int, set[str]] = {}
    for period_id, slot in rows:
        ran.setdefault(period_id, set()).add(slot)
    return ran


def _run_one(
    session: Session,
    period_id: int,
    now: datetime,
    slots: tuple[RunSlot, ...],
    team_ids: list[int],
    room_ids: list[int],
) -> AutoRun:
    # 두 계산 시각이 모두 지난 경우에도 계산은 1번만 합니다. 같은 기간을 같은 입력으로 2번
    # 계산한 결과가 같기 때문입니다. 1번 계산하고 두 시각 모두 실행한 것으로 기록합니다.
    try:
        result = assign_period(
            session, period_id, team_ids, room_ids, saved_at=now
        )
    except Exception as error:  # noqa: BLE001 - 한 기간의 계산이 실패해도 다음 기간을 계속 처리합니다
        session.rollback()
        logger.exception("자동 배정이 실패했습니다 (period=%s)", period_id)
        return AutoRun(period_id, now.date(), (), saved=False, error=str(error))

    # 실행 기록은 계산이 완료된 후에 남깁니다. 시작할 때 기록하면 중간에 실패했을 때
    # 그 시각이 다시 실행되지 않기 때문입니다. 그날 배정이 비는 것이 계산을 1번 더
    # 실행하는 것보다 나쁩니다. 다시 실행해도 assign_period 는 같은 기간을 다시 계산해
    # 덮어쓰기 때문입니다.
    _mark_ran(session, period_id, now, slots)

    # 알림은 저장이 완료되고 실행 기록을 commit 한 후에 생성합니다.
    # 배정할 slot 을 찾지 못해 저장하지 않으면 확정 시간표가 변경되지 않으므로
    # 알릴 내용이 없습니다. 알림 생성이 실패해도 실행 기록은 이미 commit 되어 있어
    # 계산을 다시 실행하지 않습니다.
    if result.saved:
        notify_assignment_updated(session, period_id, now)
    return AutoRun(period_id, now.date(), slots, saved=result.saved, error=None)


def _mark_ran(
    session: Session, period_id: int, now: datetime, slots: tuple[RunSlot, ...]
) -> None:
    # (기간, 날짜, 계산 시각)을 assignment_runs 에 기록합니다. 세 열에 unique 제약이
    # 있어 같은 시각이 중복으로 기록되지 않습니다.
    for slot in slots:
        session.add(
            AssignmentRun(
                period_id=period_id, run_on=now.date(), slot=slot, ran_at=now
            )
        )
    session.commit()


def enabled_from_env() -> bool:
    # AUTO_ASSIGN_ENABLED 가 false/0/no 이면 비활성화합니다. 설정되지 않으면 활성화합니다.
    return os.environ.get(_ENABLED_VARIABLE, "true").strip().lower() not in (
        "false",
        "0",
        "no",
    )


def interval_seconds_from_env() -> int:
    # AUTO_ASSIGN_INTERVAL_SECONDS 를 초 단위 정수로 읽습니다. 숫자가 아니거나 0 이하면
    # 기본값을 사용합니다. 0 이하를 그대로 사용하면 중단 없이 반복 실행되기 때문입니다.
    try:
        seconds = int(os.environ.get(_INTERVAL_VARIABLE, ""))
    except ValueError:
        return DEFAULT_INTERVAL_SECONDS
    return seconds if seconds > 0 else DEFAULT_INTERVAL_SECONDS


def main() -> None:
    """확인 간격마다 계산 시각이 지난 기간이 있는지 확인하는 무한 반복입니다. container 의 시작 명령입니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not enabled_from_env():
        logger.info("%s 가 비활성화되어 있어 자동 배정을 실행하지 않습니다", _ENABLED_VARIABLE)
        return

    interval = interval_seconds_from_env()
    open_session = get_session_factory()
    logger.info("자동 배정을 시작합니다 (확인 간격 %s초)", interval)
    while True:
        # 한 스레드에서 순차적으로 실행합니다. 계산(최대 약 22초)이 확인 간격보다 길어도
        # 이 블록이 완료된 후 다음 sleep 으로 진행하므로 겹치지 않습니다.
        try:
            with open_session() as session:
                for result in run_due_assignments(session, datetime.now()):
                    logger.info("자동 배정: %s", result)
        except Exception:  # noqa: BLE001 - DB 가 일시적으로 끊겨도 다음 확인 때 다시 시도
            logger.exception("자동 배정 확인이 실패했습니다")
        sleep(interval)


if __name__ == "__main__":
    main()
