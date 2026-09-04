import threading
import time
from collections.abc import Callable

import pytest

from backend.api.job_runner import DEFAULT_MAX_CONCURRENT_JOBS, JobRunner, max_concurrent_jobs_from_env


def _wait_until(predicate: Callable[[], bool], timeout: float = 5.0) -> None:
    # predicate() 가 참이 될 때까지 짧게 반복해서 확인한다. 배경 스레드가 store 를
    # 갱신하는 시점은 테스트 스레드와 다르므로, 값을 한 번만 보고 판단할 수 없다.
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.01)
    raise AssertionError("제한 시간 안에 조건을 만족하지 못했습니다")


def _status(runner: JobRunner[str], job_id: str) -> str | None:
    job = runner.get(job_id)
    return job.status if job is not None else None


def test_submit_returns_a_queued_job_immediately() -> None:
    runner: JobRunner[str] = JobRunner(max_concurrent=1)
    release = threading.Event()

    def work() -> str:
        release.wait(timeout=5)
        return "done"

    job = runner.submit(period_id=7, work=work)

    assert job.period_id == 7
    assert job.status in ("queued", "running")
    assert job.result is None
    assert job.error is None
    release.set()


def test_job_moves_from_running_to_done_with_the_result() -> None:
    runner: JobRunner[str] = JobRunner(max_concurrent=1)

    job = runner.submit(period_id=1, work=lambda: "the result")

    _wait_until(lambda: _status(runner, job.id) == "done")
    finished = runner.get(job.id)
    assert finished is not None
    assert finished.status == "done"
    assert finished.result == "the result"
    assert finished.error is None
    assert finished.finished_at is not None


def test_a_failing_job_becomes_failed_with_a_readable_message() -> None:
    runner: JobRunner[str] = JobRunner(max_concurrent=1)

    def boom() -> str:
        raise ValueError("사람이 읽을 사유")

    job = runner.submit(period_id=1, work=boom)

    _wait_until(lambda: _status(runner, job.id) == "failed")
    failed = runner.get(job.id)
    assert failed is not None
    assert failed.status == "failed"
    assert failed.error == "사람이 읽을 사유"
    assert failed.result is None


def test_an_unexpected_error_does_not_leak_internal_detail() -> None:
    runner: JobRunner[str] = JobRunner(max_concurrent=1)

    def boom() -> str:
        raise RuntimeError("postgresql://user:pw@db:5432/banblit 에 닿지 못함")

    job = runner.submit(period_id=1, work=boom)

    _wait_until(lambda: _status(runner, job.id) == "failed")
    failed = runner.get(job.id)
    assert failed is not None
    assert "postgresql" not in (failed.error or "")


def test_unknown_job_id_returns_none() -> None:
    runner: JobRunner[str] = JobRunner(max_concurrent=1)

    assert runner.get("no-such-id") is None


def test_extra_jobs_stay_queued_until_a_worker_frees_up() -> None:
    """max_concurrent=1 이면 두 번째 작업은 첫 번째가 끝날 때까지 running 이 되지 않는다."""
    runner: JobRunner[str] = JobRunner(max_concurrent=1)
    first_started = threading.Event()
    release_first = threading.Event()

    def slow() -> str:
        first_started.set()
        release_first.wait(timeout=5)
        return "first"

    first = runner.submit(period_id=1, work=slow)
    assert first_started.wait(timeout=5)

    second = runner.submit(period_id=1, work=lambda: "second")
    second_job = runner.get(second.id)
    assert second_job is not None
    assert second_job.status == "queued"

    release_first.set()
    _wait_until(lambda: _status(runner, second.id) == "done")
    done = runner.get(second.id)
    assert done is not None
    assert done.result == "second"


def test_max_concurrent_jobs_from_env_reads_a_positive_integer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ASSIGN_MAX_CONCURRENT_JOBS", "5")

    assert max_concurrent_jobs_from_env() == 5


@pytest.mark.parametrize("bad", ["0", "-1", "많이", ""])
def test_max_concurrent_jobs_from_env_falls_back_to_default(
    monkeypatch: pytest.MonkeyPatch, bad: str
) -> None:
    monkeypatch.setenv("ASSIGN_MAX_CONCURRENT_JOBS", bad)

    assert max_concurrent_jobs_from_env() == DEFAULT_MAX_CONCURRENT_JOBS


def test_max_concurrent_jobs_from_env_falls_back_when_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ASSIGN_MAX_CONCURRENT_JOBS", raising=False)

    assert max_concurrent_jobs_from_env() == DEFAULT_MAX_CONCURRENT_JOBS
