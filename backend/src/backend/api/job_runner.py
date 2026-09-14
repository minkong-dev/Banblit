"""배정 계산을 백그라운드 스레드에서, 정해진 개수만큼만 동시에 실행합니다.

작업 기록은 프로세스 메모리에만 있습니다. 서버를 재시작하면 진행 중이던 계산과 그 기록이
함께 사라집니다 — 계산 자체가 스레드에 바인드되어 있어 재시작 후 계속 실행할 방법이 없으므로,
기록만 DB에 남겨도 결과를 복구할 수 없습니다.

ponytail: 완료된 작업 기록을 삭제하지 않습니다. 하루 두 번 자동 실행 + 사용자가 누른 몇 번이
프로세스가 실행되는 동안 쌓이는 정도라 몇 달은 문제없습니다. 장시간 운영 시 submit 때
완료된 지 오래된 것을 정리하면 됩니다.
"""

import logging
import os
import uuid
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Generic, Literal, TypeVar

logger = logging.getLogger(__name__)

ResultT = TypeVar("ResultT")
JobStatus = Literal["queued", "running", "done", "failed"]

DEFAULT_MAX_CONCURRENT_JOBS = 2


@dataclass(frozen=True)
class Job(Generic[ResultT]):
    """배정 작업 하나의 상태입니다. 화면이 조회할 때마다 Future를 읽어 그 순간의 상태를 반환합니다."""

    id: str
    period_id: int
    status: JobStatus
    requested_at: datetime
    finished_at: datetime | None = None
    result: ResultT | None = None
    error: str | None = None


@dataclass
class _Entry(Generic[ResultT]):
    period_id: int
    requested_at: datetime
    future: Future[ResultT]
    started: bool = False
    finished_at: datetime | None = None


class JobRunner(Generic[ResultT]):
    """작업(work)을 접수 즉시 큐에 추가하고, 스레드 풀 여유가 생길 때 실행합니다.

    진행 상태를 별도로 추적하지 않습니다 — Future가 이미 관리합니다(running·done·exception·result).
    """

    def __init__(self, max_concurrent: int) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_concurrent)
        self._entries: dict[str, _Entry[ResultT]] = {}

    def submit(self, period_id: int, work: Callable[[], ResultT]) -> Job[ResultT]:
        job_id = uuid.uuid4().hex
        entry: _Entry[ResultT] = _Entry(period_id=period_id, requested_at=datetime.now(), future=Future())
        self._entries[job_id] = entry

        def run() -> None:
            # max_workers를 초과하는 작업은 풀의 대기열에서 기다립니다. 실제로 실행을 시작할 때
            # 이를 기록해야 "queued"와 "running"이 구분됩니다.
            entry.started = True
            try:
                entry.future.set_result(work())
            except Exception as error:  # noqa: BLE001 - 실패를 failed로 기록하고 서버는 계속 동작합니다
                logger.exception("배정 작업이 실패했습니다 (job=%s)", job_id)
                entry.future.set_exception(error)
            entry.finished_at = datetime.now()

        self._executor.submit(run)
        return self._snapshot(job_id, entry)

    def get(self, job_id: str) -> Job[ResultT] | None:
        entry = self._entries.get(job_id)
        return None if entry is None else self._snapshot(job_id, entry)

    def _snapshot(self, job_id: str, entry: _Entry[ResultT]) -> Job[ResultT]:
        base: Job[ResultT] = Job(
            id=job_id, period_id=entry.period_id, status="queued", requested_at=entry.requested_at
        )
        if not entry.future.done():
            return replace(base, status="running") if entry.started else base
        error = entry.future.exception()
        if error is None:
            return replace(base, status="done", result=entry.future.result(), finished_at=entry.finished_at)
        # ValueError는 assign_period가 의도적으로 발생시킨 사용자 메시지입니다. 그대로 반환합니다.
        # 기타 예외는 접근 정보 같은 내부 정보가 포함될 수 있어 기록에만 남깁니다.
        message = str(error) if isinstance(error, ValueError) else "배정 계산 중 오류가 발생했습니다"
        return replace(base, status="failed", error=message, finished_at=entry.finished_at)


def max_concurrent_jobs_from_env() -> int:
    # ASSIGN_MAX_CONCURRENT_JOBS 환경변수를 읽습니다. 숫자가 아니거나 0 이하이면 기본값을 반환합니다.
    try:
        value = int(os.environ.get("ASSIGN_MAX_CONCURRENT_JOBS", ""))
    except ValueError:
        return DEFAULT_MAX_CONCURRENT_JOBS
    return value if value > 0 else DEFAULT_MAX_CONCURRENT_JOBS
