"""정해진 시각이 지난 기간의 배정을 스스로 실행한다.

서버(api)와 같은 이미지를 쓰는 별도 컨테이너로 동작한다. 서버를 여러 대로 늘려도
이 서비스만 한 대로 두면 같은 계산이 여러 번 실행되지 않는다. HTTP endpoint 를 거치지 않고
assign_period 를 직접 부르므로 서버가 떠 있지 않아도 계산이 된다.
"""

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, time
from time import sleep
from typing import Literal

from sqlalchemy import select
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
    """자동 배정 한 기간분의 결과. slots 는 이번에 실행한 것으로 표시한 연산 시각들이다."""

    period_id: int
    run_on: date
    slots: tuple[RunSlot, ...]
    saved: bool
    error: str | None


def due_slots(
    period: Period, now: datetime, already_ran: set[str]
) -> tuple[RunSlot, ...]:
    # period 의 두 연산 시각 중 now 까지 지났고 아직 실행하지 않은 것을 돌려준다.
    # 어제 놓친 것은 보지 않는다 — 배정은 기간 전체를 다시 푸는 계산이라 어제 것을
    # 지금 실행하는 것과 오늘 것을 지금 실행하는 것이 같은 결과가 된다.
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
    """now 기준으로 실행할 차례가 된 기간을 전부 계산하고, 실행한 시각을 table 에 남긴다.

    한 기간이 터져도 다음 기간을 계속 본다 — 실패는 기록에 남기고 표시는 남기지
    않아 다음 확인 때 다시 시도된다. 시각을 인자로 받으므로 테스트가 아무 시각이나
    넣어볼 수 있다.
    """
    today = now.date()
    # 오늘이 기간 안에 드는 집중 합주기간만 본다. 상시 개방기간(open)은 선착순
    # 예약으로 동작해 assign_period 가 아예 거절한다.
    periods = session.scalars(
        select(Period)
        .where(Period.kind == "focused")
        .where(Period.starts_on <= today)
        .where(Period.ends_on >= today)
        .order_by(Period.id)
    ).all()
    if not periods:
        return []

    ran_by_period = _ran_slots_today(session, [period.id for period in periods], today)
    # 사람이 버튼을 누를 때는 화면이 팀·합주실을 골라 보내지만 자동 실행에는 고를
    # 사람이 없다. 등록된 전부를 대상으로 실행한다 — 화면이 보내던 목록을 대신하는
    # 기본값이라, 일부만 실행하려면 그 목록을 남기는 table(period_rooms 등)이 먼저 있어야 한다.
    team_ids = list(session.scalars(select(Team.id).order_by(Team.id)).all())
    room_ids = list(session.scalars(select(Room.id).order_by(Room.id)).all())

    results: list[AutoRun] = []
    for period in periods:
        slots = due_slots(period, now, ran_by_period.get(period.id, set()))
        if not slots:
            continue
        results.append(_run_one(session, period.id, today, slots, team_ids, room_ids))
    return results


def _ran_slots_today(
    session: Session, period_ids: list[int], today: date
) -> dict[int, set[str]]:
    # 오늘 이미 실행한 (기간, 시각) 을 기간별 집합으로 모은다.
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
    today: date,
    slots: tuple[RunSlot, ...],
    team_ids: list[int],
    room_ids: list[int],
) -> AutoRun:
    # 두 시각이 다 밀려 있어도 계산은 한 번만 한다 — 같은 기간을 같은 입력으로 두 번
    # 푸는 것이라 결과가 같다. 늦은 쪽을 실행하고 이른 쪽도 실행한 것으로 함께 표시한다.
    try:
        result = assign_period(
            session, period_id, team_ids, room_ids, saved_at=datetime.now()
        )
    except Exception as error:  # noqa: BLE001 - 한 기간이 터져도 다음 기간을 계속 본다
        session.rollback()
        logger.exception("자동 배정이 실패했습니다 (period=%s)", period_id)
        return AutoRun(period_id, today, (), saved=False, error=str(error))

    # 표시는 계산이 끝난 뒤에 남긴다. 시작할 때 남기면 도중에 죽었을 때 그 시각이
    # 영영 실행되지 않는다 — 그날 배정이 통째로 비는 쪽이, 22초짜리 계산을 한 번 더
    # 실행하는 쪽보다 나쁘다. 다시 실행해도 assign_period 는 같은 기간을 다시 풀어 덮어쓴다.
    _mark_ran(session, period_id, today, slots)

    # 알림은 저장이 실제로 된 뒤에만, 그리고 실행 표시를 남긴 뒤에 남긴다. 배정할
    # slot 을 못 찾아 저장이 안 되면 사람이 보던 시간표가 그대로라 알릴 것이 없고,
    # 알리는 쪽이 터져도 실행 표시는 이미 커밋돼 있어 22초짜리 계산을 다시 실행하지 않는다.
    if result.saved:
        notify_assignment_updated(session, period_id, datetime.now())
    return AutoRun(period_id, today, slots, saved=result.saved, error=None)


def _mark_ran(
    session: Session, period_id: int, today: date, slots: tuple[RunSlot, ...]
) -> None:
    # (기간, 날짜, 시각) 을 assignment_runs 에 남긴다. 그 셋에 중복 금지가 걸려 있어
    # 같은 시각이 두 줄로 남지 않는다.
    for slot in slots:
        session.add(
            AssignmentRun(
                period_id=period_id, run_on=today, slot=slot, ran_at=datetime.now()
            )
        )
    session.commit()


def enabled_from_env() -> bool:
    # AUTO_ASSIGN_ENABLED 가 false/0/no 면 끈다. 없으면 켠다.
    return os.environ.get(_ENABLED_VARIABLE, "true").strip().lower() not in (
        "false",
        "0",
        "no",
    )


def interval_seconds_from_env() -> int:
    # AUTO_ASSIGN_INTERVAL_SECONDS 를 초 단위 정수로 읽는다. 숫자가 아니거나 0 이하면
    # 기본값 — 0 이하를 그대로 쓰면 쉬지 않고 실행되는 반복이 된다.
    try:
        seconds = int(os.environ.get(_INTERVAL_VARIABLE, ""))
    except ValueError:
        return DEFAULT_INTERVAL_SECONDS
    return seconds if seconds > 0 else DEFAULT_INTERVAL_SECONDS


def main() -> None:
    """확인 간격마다 깨어나 실행할 것이 있는지 보는 반복. 컨테이너의 시작 명령이다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not enabled_from_env():
        logger.info("%s 가 꺼져 있어 자동 배정을 돌리지 않습니다", _ENABLED_VARIABLE)
        return

    interval = interval_seconds_from_env()
    open_session = get_session_factory()
    logger.info("자동 배정을 시작합니다 (확인 간격 %s초)", interval)
    while True:
        # 한 스레드에서 순서대로 실행한다 — 계산(최대 22.2초, 2026-08-28 실측)이 확인
        # 간격보다 길어도, 이 줄이 끝나야 다음 sleep 으로 넘어가므로 겹치지 않는다.
        try:
            with open_session() as session:
                for result in run_due_assignments(session, datetime.now()):
                    logger.info("자동 배정: %s", result)
        except Exception:  # noqa: BLE001 - DB 가 잠깐 끊겨도 다음 확인 때 다시 본다
            logger.exception("자동 배정 확인이 실패했습니다")
        sleep(interval)


if __name__ == "__main__":
    main()
