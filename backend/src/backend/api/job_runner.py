"""배정 계산을 배경 스레드에서, 정해진 개수만큼만 동시에 실행한다.

작업 기록은 프로세스 메모리에만 있다. 서버를 다시 띄우면 진행 중이던 계산과 그 기록이
함께 사라진다 — 계산 자체가 스레드에 묶여 있어 재시작해도 이어서 실행할 방법이 없으므로,
기록만 DB에 남겨도 결과가 복구되지는 않는다.

ponytail: 끝난 작업 기록을 지우지 않는다. 하루 두 번 자동 실행 + 사람이 누른 몇 번이
프로세스가 사는 동안 쌓이는 정도라 몇 달은 문제없다. 오래 켜 두게 되면 submit 때
finished 된 지 한참 지난 것을 걷어내면 된다.
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
    """배정 작업 하나의 상태. 화면이 되물을 때마다 Future 를 읽어 그 순간의 상태로 만든다."""

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
    """work 를 접수 즉시 큐에 넣고, 스레드 풀에 여유가 생기는 대로 실행한다.

    진행 상태는 따로 적지 않는다 — Future 가 이미 안다(running·done·exception·result).
    """

    def __init__(self, max_concurrent: int) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_concurrent)
        self._entries: dict[str, _Entry[ResultT]] = {}

    def submit(self, period_id: int, work: Callable[[], ResultT]) -> Job[ResultT]:
        job_id = uuid.uuid4().hex
        entry: _Entry[ResultT] = _Entry(period_id=period_id, requested_at=datetime.now(), future=Future())
        self._entries[job_id] = entry

        def run() -> None:
            # max_workers 를 넘는 만큼은 풀의 대기열에서 기다린다. 실제로 돌기 시작한
            # 순간을 적어야 "queued" 와 "running" 이 갈린다.
            entry.started = True
            try:
                entry.future.set_result(work())
            except Exception as error:  # noqa: BLE001 - 실패를 failed 로 남기고 서버는 계속 동작한다
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
        # ValueError 는 assign_period 가 사람이 읽으라고 일부러 올린 사유라 그대로 보여준다.
        # 그 밖의 예외는 접속 정보 같은 내부 사정이 섞여 있을 수 있어 기록에만 남긴다.
        message = str(error) if isinstance(error, ValueError) else "배정 계산 중 오류가 발생했습니다"
        return replace(base, status="failed", error=message, finished_at=entry.finished_at)


def max_concurrent_jobs_from_env() -> int:
    # ASSIGN_MAX_CONCURRENT_JOBS 환경변수를 읽는다. 숫자가 아니거나 0 이하면 기본값.
    try:
        value = int(os.environ.get("ASSIGN_MAX_CONCURRENT_JOBS", ""))
    except ValueError:
        return DEFAULT_MAX_CONCURRENT_JOBS
    return value if value > 0 else DEFAULT_MAX_CONCURRENT_JOBS
