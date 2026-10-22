"""jobs/auto_assign.py 의 DB 없는 판정을 검증합니다. 계산 시각 판정(services/period/pipeline.py 의 due_slots), 환경변수 해석, 상태 확인용 heartbeat 파일입니다."""

from datetime import datetime, time
from pathlib import Path

import pytest

from backend.db.models import Period
from backend.jobs import auto_assign
from backend.services.period.pipeline import due_slots


def _period() -> Period:
    return Period(first_run_at=time(9, 0), second_run_at=time(21, 0))


def test_only_passed_and_unrun_slots_are_due() -> None:
    period = _period()

    assert due_slots(period, datetime(2026, 10, 15, 8, 59), set()) == ()
    assert due_slots(period, datetime(2026, 10, 15, 21, 0), set()) == ("first", "second")
    assert due_slots(period, datetime(2026, 10, 15, 21, 0), {"first"}) == ("second",)


def test_the_job_is_enabled_unless_switched_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AUTO_ASSIGN_ENABLED", raising=False)
    assert auto_assign.enabled_from_env()
    monkeypatch.setenv("AUTO_ASSIGN_ENABLED", "No")
    assert not auto_assign.enabled_from_env()


def test_a_bad_interval_falls_back_to_the_default(monkeypatch: pytest.MonkeyPatch) -> None:
    for bad in ("0", "-3", "abc"):
        monkeypatch.setenv("AUTO_ASSIGN_INTERVAL_SECONDS", bad)
        assert auto_assign.interval_seconds_from_env() == auto_assign.DEFAULT_INTERVAL_SECONDS
    monkeypatch.setenv("AUTO_ASSIGN_INTERVAL_SECONDS", "15")
    assert auto_assign.interval_seconds_from_env() == 15


def test_a_finished_check_writes_its_time_for_the_healthcheck(tmp_path: Path) -> None:
    # compose healthcheck 가 이 파일의 시각이 확인 간격의 3배보다 오래됐는지 봅니다(docker-compose.yml).
    beat = tmp_path / "heartbeat"

    auto_assign.write_heartbeat(beat, datetime(2026, 10, 15, 9, 0, 30))

    assert beat.read_text() == "2026-10-15T09:00:30"
