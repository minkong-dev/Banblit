"""계산 시각이 지난 집중 합주기간의 배정을 자동으로 실행합니다.

서버(api)와 같은 Docker image 를 사용하는 별도 container 로 동작합니다. 서버를 여러 대로 확장해도
이 서비스는 한 대로 유지하므로 같은 계산이 여러 번 실행되지 않습니다. HTTP endpoint 를 거치지 않고
run_period_assignment 를 직접 호출하므로 서버가 실행 중이 아니어도 계산을 수행합니다.
"""

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from time import sleep

from sqlalchemy.orm import Session

from backend.services.board.pipeline import sweep_stale_drafts
from backend.services.period.pipeline import (
    due_slots,
    every_team_and_room,
    fix_closed_period,
    focused_periods_on,
    is_closed,
    mark_ran,
    period_days,
    periods_to_fix,
    ran_slots_today,
    run_period_assignment,
)
from backend.contract import RunSlot
from backend.db.pipeline import get_session_factory

logger = logging.getLogger(__name__)

DEFAULT_INTERVAL_SECONDS = 60
# 확인 1회가 끝날 때마다 시각을 쓰는 파일입니다. docker-compose.yml 의 auto-assign healthcheck 가 이 파일의 수정 시각을 봅니다.
HEARTBEAT_FILE = Path("/tmp/auto-assign-heartbeat")
_ENABLED_VARIABLE = "AUTO_ASSIGN_ENABLED"
_INTERVAL_VARIABLE = "AUTO_ASSIGN_INTERVAL_SECONDS"


@dataclass(frozen=True)
class AutoRun:
    """기간 하나의 자동 배정 결과입니다. slots 는 이번 실행에서 실행한 것으로 기록한 계산 시각 목록입니다."""

    period_id: int
    run_on: date
    slots: tuple[RunSlot, ...]
    error: str | None


# 쓰다 만 초안을 남겨 두는 기간입니다. 화면은 나갈 때 삭제하지만 탭을 닫거나 연결이 끊기면
# 그 요청이 가지 않습니다. 이 기간이 지난 초안은 아래 main 의 반복이 삭제합니다.
DRAFT_LIFETIME = timedelta(days=1)


def run_due_assignments(session: Session, now: datetime) -> list[AutoRun]:
    """now 기준으로 계산 시각이 지난 기간을 전부 계산하고, 실행한 시각을 assignment_runs table 에 기록합니다.

    한 기간의 계산이 실패해도 다음 기간을 계속 처리합니다. 실패는 로그에 남기고 assignment_runs 에는
    기록하지 않으므로 다음 확인 때 다시 시도합니다. 시각을 인자로 받으므로 테스트가 임의의
    시각을 대입할 수 있습니다.
    """
    today = now.date()
    # 사용자가 버튼을 누를 때는 화면이 팀·합주실을 선택해 전송하지만 자동 실행에는 선택할
    # 사람이 없습니다. 등록된 모든 팀과 합주실을 대상으로 실행합니다. 일부만 실행하려면
    # 선택 목록을 저장하는 table(period_rooms 등)을 먼저 추가해야 합니다.
    team_ids, room_ids = every_team_and_room(session)
    # 마감 일시가 지난 기간을 먼저 확정합니다. 마감된 기간은 아래 periods 에서 제외해 다시 계산하지 않습니다.
    _fix_closed(session, now, team_ids, room_ids)
    # 오늘이 기간 안에 포함되는 집중 합주기간만 처리합니다. 상시 기간(kind="open")은 선착순
    # 예약으로 동작하므로 assign_period 가 거절합니다. everyday 가 켜진 기간은 종료일이 없으므로
    # 시작일만 지났으면 매일 처리합니다.
    periods = [period for period in focused_periods_on(session, today) if not is_closed(period, now)]
    if not periods:
        return []

    ran_by_period = ran_slots_today(session, [period.id for period in periods], today)

    results: list[AutoRun] = []
    for period in periods:
        # 배정할 날짜가 전체 합주 날짜뿐이면 assign_period 가 거절하므로 실행하지 않습니다.
        # 실행하면 실패는 기록되지 않아 확인할 때마다 다시 실패합니다.
        slots = due_slots(period, now, ran_by_period.get(period.id, set()))
        if not slots or not period_days(period, today):
            continue
        results.append(_run_one(session, period.id, now, slots, team_ids, room_ids))
    return results


def _fix_closed(session: Session, now: datetime, team_ids: list[int], room_ids: list[int]) -> None:
    # 마감 일시가 지난 기간을 1개씩 확정합니다. 한 기간이 실패해도 다음 기간을 계속 처리하고, 실패한 기간은 다음 확인 때 다시 시도합니다.
    for period in periods_to_fix(session, now):
        try:
            fix_closed_period(session, period, team_ids, room_ids, now)
        except Exception:  # noqa: BLE001 - 한 기간의 확정이 실패해도 다음 기간을 계속 처리합니다
            session.rollback()
            logger.exception("자동 확정이 실패했습니다 (period=%s)", period.id)


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
    # mark_ran 도 같은 try 안에 둡니다. 밖에 두면 기록 실패가 run_due_assignments 밖으로 전파되어
    # 남은 기간의 계산과 main 의 초안 삭제가 이번 확인에서 건너뛰어집니다.
    try:
        run_period_assignment(session, period_id, team_ids, room_ids, saved_at=now)
        # 실행 기록은 계산이 완료된 후에 남깁니다. 시작할 때 기록하면 중간에 실패했을 때
        # 그 시각이 다시 실행되지 않기 때문입니다. 다시 실행해도 스케줄링 기록이 1개 더 쌓일 뿐
        # 현재 배정안은 바뀌지 않습니다.
        # 기록 저장은 run_period_assignment 안에서 이미 commit 되었습니다.
        mark_ran(session, period_id, now, slots)
    except Exception as error:  # noqa: BLE001 - 한 기간의 계산이 실패해도 다음 기간을 계속 처리합니다
        session.rollback()
        logger.exception("자동 배정이 실패했습니다 (period=%s)", period_id)
        return AutoRun(period_id, now.date(), (), error=str(error))
    return AutoRun(period_id, now.date(), slots, error=None)


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


def write_heartbeat(path: Path, now: datetime) -> None:
    """확인 1회가 끝난 시각 now 를 path 에 씁니다. 반복이 멈추면 이 파일이 갱신되지 않아 healthcheck 가 unhealthy 로 판정합니다."""
    path.write_text(now.isoformat(timespec="seconds"))


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
        # 한 thread 에서 순차적으로 실행합니다. 계산 1회(최대 SOLVER_TIME_LIMIT_SECONDS)가 확인 간격보다 길어도
        # 이 블록이 완료된 후 sleep 으로 진행하므로 실행이 겹치지 않습니다.
        try:
            # open_session 은 db/pipeline.py 의 get_session_factory 가 반환한 sessionmaker 입니다. with 블록을 나갈 때
            # session 을 닫고 commit 되지 않은 변경은 버립니다. commit 은 호출하는 service 함수가 각자 수행합니다.
            with open_session() as session:
                for result in run_due_assignments(session, datetime.now()):
                    logger.info("자동 배정: %s", result)
                # 생성 후 DRAFT_LIFETIME 이 지난 초안을 삭제합니다. 초안은 목록에 표시되지 않아 사용자가 삭제할 수 없습니다.
                removed = sweep_stale_drafts(session, datetime.now() - DRAFT_LIFETIME)
                if removed > 0:
                    logger.info("버려진 초안 %d개를 삭제했습니다", removed)
            # 확인이 끝까지 성공했을 때만 씁니다. DB 가 계속 끊겨 실패가 반복되면 healthcheck 가 unhealthy 로 드러냅니다.
            write_heartbeat(HEARTBEAT_FILE, datetime.now())
        except Exception:  # noqa: BLE001 - DB 가 일시적으로 끊겨도 다음 확인 때 다시 시도
            logger.exception("자동 배정 확인이 실패했습니다")
        sleep(interval)


# python -m backend.jobs.auto_assign 처럼 이 파일을 직접 실행할 때만 __name__ 이 "__main__" 입니다.
# import 될 때는 main 을 실행하지 않습니다.
if __name__ == "__main__":
    main()
