"""배정 계산을 배경 스레드에서, 정해진 개수만큼만 동시에 돌린다.

작업 기록(Job)은 프로세스 메모리에만 있다. 서버를 다시 띄우면 진행 중이던 계산과
그 기록이 함께 사라진다 — 계산 자체가 스레드에 묶여 있어 재시작해도 이어서 돌릴
방법이 없으므로, 기록만 DB에 남겨도 결과가 복구되지는 않는다. gateway·scheduler·
store 를 별도 프로세스로 쪼개는 것은 이번 범위 밖이라(AUDIT.md 4부), 지금은
이 손실을 받아들인다.
"""

import logging
import os
import threading
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Generic, Literal, TypeVar

logger = logging.getLogger(__name__)

ResultT = TypeVar("ResultT")
JobStatus = Literal["queued", "running", "done", "failed"]

DEFAULT_MAX_CONCURRENT_JOBS = 2


@dataclass(frozen=True)
class Job(Generic[ResultT]):
    """배정 작업 하나의 상태. 바뀔 때마다 새 Job을 만들어 store 에 다시 넣는다."""

    id: str
    period_id: int
    status: JobStatus
    requested_at: datetime
    finished_at: datetime | None = None
    result: ResultT | None = None
    error: str | None = None


class JobStore(Generic[ResultT]):
    """작업 번호로 Job을 찾는다. 여러 스레드가 동시에 읽고 쓸 수 있어 lock을 건다."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job[ResultT]] = {}
        self._lock = threading.Lock()

    def put(self, job: Job[ResultT]) -> None:
        with self._lock:
            self._jobs[job.id] = job

    def get(self, job_id: str) -> Job[ResultT] | None:
        with self._lock:
            return self._jobs.get(job_id)


class JobRunner(Generic[ResultT]):
    """work 를 접수 즉시 큐에 넣고, 스레드 풀이 자리가 나는 대로 실행한다."""

    def __init__(self, max_concurrent: int) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_concurrent)
        self._store: JobStore[ResultT] = JobStore()

    def submit(self, period_id: int, work: Callable[[], ResultT]) -> Job[ResultT]:
        job: Job[ResultT] = Job(
            id=uuid.uuid4().hex,
            period_id=period_id,
            status="queued",
            requested_at=datetime.now(),
        )
        self._store.put(job)
        # max_workers 를 넘는 만큼은 ThreadPoolExecutor 내부 대기열에 쌓인다.
        # 여기서 거부하지 않는다 — job은 "queued"로 남아 자리가 빌 때까지 기다린다.
        self._executor.submit(self._run, job.id, work)
        return job

    def get(self, job_id: str) -> Job[ResultT] | None:
        return self._store.get(job_id)

    def _run(self, job_id: str, work: Callable[[], ResultT]) -> None:
        self._mark_running(job_id)
        try:
            result = work()
        except Exception as error:  # noqa: BLE001 - 실패를 failed 로 남기고 서버는 계속 돈다
            self._mark_failed(job_id, error)
            return
        self._mark_done(job_id, result)

    def _mark_running(self, job_id: str) -> None:
        current = self._store.get(job_id)
        if current is not None:
            self._store.put(replace(current, status="running"))

    def _mark_done(self, job_id: str, result: ResultT) -> None:
        current = self._store.get(job_id)
        if current is not None:
            self._store.put(
                replace(current, status="done", result=result, finished_at=datetime.now())
            )

    def _mark_failed(self, job_id: str, error: Exception) -> None:
        # ValueError 는 assign_period 가 사람이 읽으라고 일부러 올린 사유라 그대로
        # 보여준다. 그 밖의 예외는 접속 정보 같은 내부 사정이 섞여 있을 수 있어
        # 기록에만 상세를 남기고 화면에는 정해진 문장 하나만 보낸다.
        logger.exception("배정 작업이 실패했습니다 (job=%s)", job_id)
        message = (
            str(error) if isinstance(error, ValueError) else "배정 계산 중 오류가 발생했습니다"
        )
        current = self._store.get(job_id)
        if current is not None:
            self._store.put(
                replace(current, status="failed", error=message, finished_at=datetime.now())
            )


def max_concurrent_jobs_from_env() -> int:
    # ASSIGN_MAX_CONCURRENT_JOBS 환경변수를 읽는다. 숫자가 아니거나 0 이하면 기본값.
    try:
        value = int(os.environ.get("ASSIGN_MAX_CONCURRENT_JOBS", ""))
    except ValueError:
        return DEFAULT_MAX_CONCURRENT_JOBS
    return value if value > 0 else DEFAULT_MAX_CONCURRENT_JOBS
