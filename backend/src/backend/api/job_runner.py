"""배정 계산을 백그라운드 스레드에서, 지정된 개수만큼만 동시에 실행합니다.

작업 기록은 process 메모리에만 있습니다. 서버를 재시작하면 진행 중이던 계산과 기록이 함께 삭제됩니다.

ponytail: 완료된 작업 기록을 삭제하지 않습니다. 사용자가 배정 계산을 실행한 횟수만큼 쌓입니다. 장시간 운영할
경우 submit 에서 완료된 지 오래된 기록을 삭제합니다.
"""

import logging
import uuid
from collections.abc import Callable
# ThreadPoolExecutor 는 작업을 worker thread(최대 max_workers 개)에서 실행하는 실행기이고, Future 는 작업 1개의 결과를 나중에 읽는 자리입니다.
# 작업은 요청을 처리한 thread 가 아니라 실행기의 worker thread 에서 실행됩니다.
from concurrent.futures import Future, ThreadPoolExecutor
# replace 는 frozen dataclass 의 일부 field 만 바꾼 새 객체를 반환합니다. 원본은 변경하지 않습니다.
from dataclasses import dataclass, replace
from datetime import datetime
# TypeVar 는 타입 자리표시자이고, Generic[ResultT] 를 상속한 class 는 JobRunner[PeriodRun] 처럼 결과 타입을 지정해 씁니다.
from typing import Generic, TypeVar

from backend.contract import JobStatus

logger = logging.getLogger(__name__)

ResultT = TypeVar("ResultT")

MAX_CONCURRENT_JOBS = 2


# frozen=True 는 생성 뒤 field 를 변경할 수 없게 합니다. 조회 시점의 상태를 담은 값이라 변경할 이유가 없습니다.
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
        # 요청 thread 가 추가, 조회하고 worker thread 가 field 를 기록합니다. dict 의 항목 1개 추가와 조회, field 대입 1개는
        # GIL 아래에서 원자적이고, 같은 job 을 기록하는 thread 는 worker 1개뿐이라 잠금을 두지 않습니다.
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
            # noqa: BLE001 은 ruff 의 "모든 예외를 잡지 말라" 검사를 이 줄만 끕니다. worker thread 에서 예외가 빠져나가면
            # Future 가 영원히 끝나지 않아 화면이 queued 로 멈추므로, 어떤 예외든 failed 로 기록해야 합니다.
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
        message = str(error) if isinstance(error, ValueError) else "배정 계산 중 오류가 발생했어요"
        return replace(base, status="failed", error=message, finished_at=entry.finished_at)
