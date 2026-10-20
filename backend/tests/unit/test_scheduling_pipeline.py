"""scheduling/pipeline.py 가 계산 시간 상한, 멈춤 기준, thread 수 상한을 계산기에 넘기는지 검증합니다."""

from typing import Any

import pytest

from backend.scheduling import pipeline


def test_assign_passes_the_solver_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def spy(*args: Any, **kwargs: Any) -> str:
        captured["args"] = args
        captured.update(kwargs)
        return "assignment"

    monkeypatch.setattr(pipeline, "assign_sessions", spy)

    assert pipeline.assign([], [], 2, 60, 60, daily_max_minutes=120, max_consecutive_minutes=60, max_absent=1) == "assignment"
    assert captured["args"][5:7] == (pipeline.SOLVER_TIME_LIMIT_SECONDS, pipeline.STALL_SECONDS)
    assert captured["num_workers"] == pipeline.SOLVER_WORKERS
    assert captured["daily_max_minutes"] == 120 and captured["max_consecutive_minutes"] == 60
    assert captured["max_absent"] == 1


def test_the_solver_uses_at_most_half_of_the_cores() -> None:
    # 배정 계산이 api 와 같은 process 에서 돌므로 코어를 전부 쓰면 일반 요청이 느려집니다.
    assert 1 <= pipeline.SOLVER_WORKERS <= max(1, (pipeline.os.cpu_count() or 2) // 2)
