"""배정 계산을 백그라운드 스레드에서, 지정된 개수만큼만 동시에 실행합니다.

작업 기록은 프로세스 메모리에만 있습니다. 서버를 재시작하면 진행 중이던 계산과 그 기록이
함께 사라집니다. 계산 자체가 실행 중인 스레드 안에만 있어 재시작 후 이어서 실행할 방법이 없으므로,
기록만 DB 에 남겨도 결과를 복구할 수 없습니다.

ponytail: 완료된 작업 기록을 삭제하지 않습니다. 하루 2번의 자동 실행과 사용자가 직접 실행한
횟수만큼만 쌓이므로, 프로세스 재시작 전까지 메모리 부족이 발생하지 않습니다. 장시간 운영할
경우 submit 에서 완료된 지 오래된 기록을 삭제합니다.
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
    """작업(work)을 접수 즉시 queue(실행을 기다리는 작업이 쌓이는 목록)에 추가하고, 스레드 풀 여유가 생길 때 실행합니다.

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
            # max_workers 를 초과하는 작업은 스레드 풀의 queue 에서 기다립니다. 실제로 실행을 시작할 때
            # started 를 True 로 기록해야 "queued" 와 "running" 이 구분됩니다.
            entry.started = True
            # finished_at 을 Future 보다 먼저 기록합니다. 순서가 반대이면 그 사이의 조회가
            # status="done" 인데 finished_at 이 없는 응답을 받습니다.
            try:
                result = work()
            except Exception as error:  # noqa: BLE001 - 실패를 failed로 기록하고 서버는 계속 동작합니다
                logger.exception("배정 작업이 실패했습니다 (job=%s)", job_id)
                entry.finished_at = datetime.now()
                entry.future.set_exception(error)
                return
            entry.finished_at = datetime.now()
            entry.future.set_result(result)

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
        # ValueError 는 assign_period 가 의도적으로 발생시킨 사용자 메시지이므로 그대로 반환합니다.
        # 다른 예외는 데이터베이스 접속 정보 같은 내부 정보를 포함할 수 있으므로 로그에만 남기고
        # 화면에는 고정 문장을 반환합니다.
        message = str(error) if isinstance(error, ValueError) else "배정 계산 중 오류가 발생했습니다"
        return replace(base, status="failed", error=message, finished_at=entry.finished_at)


def max_concurrent_jobs_from_env() -> int:
    # ASSIGN_MAX_CONCURRENT_JOBS 환경변수를 읽습니다. 숫자가 아니거나 0 이하이면 기본값을 반환합니다.
    try:
        value = int(os.environ.get("ASSIGN_MAX_CONCURRENT_JOBS", ""))
    except ValueError:
        return DEFAULT_MAX_CONCURRENT_JOBS
    return value if value > 0 else DEFAULT_MAX_CONCURRENT_JOBS
