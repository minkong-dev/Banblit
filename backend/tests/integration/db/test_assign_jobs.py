import threading
from collections.abc import Callable
from datetime import date
from datetime import time as clock
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api import app as app_module
from backend.db.models import Member, Membership, Period, Position, Room, Team


def _period(session: Session, kind: str = "focused") -> int:
    period = Period(
        kind=kind,
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 1),
        everyday=False,
        first_run_at=clock(9, 0),
        second_run_at=clock(21, 0),
    )
    session.add(period)
    session.flush()
    return period.id


def _team_with_member(db_session: Session, team_name: str, member_name: str) -> int:
    position_id = db_session.scalars(select(Position.id)).first()
    team = Team(name=team_name)
    member = Member(name=member_name)
    db_session.add_all([team, member])
    db_session.flush()
    db_session.add(
        Membership(member_id=member.id, team_id=team.id, position_id=position_id)
    )
    db_session.flush()
    return team.id


def test_assign_returns_202_immediately_with_a_queued_or_running_job(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=clock(18, 0), closes_at=clock(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    response = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    )

    assert response.status_code == 202
    job = response.json()["job"]
    assert job["period_id"] == period_id
    assert job["status"] in ("queued", "running")
    assert job["result"] is None
    assert job["error"] is None
    assert job["finished_at"] is None


def test_polling_the_job_eventually_reports_the_saved_result(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=clock(18, 0), closes_at=clock(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    submitted = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    ).json()["job"]

    job = poll_job(submitted["id"])

    assert job["status"] == "done"
    assert job["error"] is None
    assert job["finished_at"] is not None
    assert job["result"]["saved"] is True
    assert job["result"]["assignment"]["feasible"] is True


def test_a_rejected_assignment_becomes_a_failed_job_with_the_reason(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
) -> None:
    period_id = _period(db_session)
    room = Room(name="1번방", opens_at=clock(18, 0), closes_at=clock(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    submitted = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [999999], "room_ids": [room.id]},
    ).json()["job"]

    job = poll_job(submitted["id"])

    assert job["status"] == "failed"
    assert job["result"] is None
    assert "그런 팀이 없습니다" in job["error"]


def test_assign_on_an_unknown_period_is_rejected_immediately(
    api_client: TestClient,
) -> None:
    response = api_client.post(
        "/periods/999999/assign", json={"team_ids": [1], "room_ids": [1]}
    )

    assert response.status_code == 422
    assert "그런 기간이 없습니다" in response.json()["detail"]


def test_unknown_job_id_is_rejected(api_client: TestClient) -> None:
    response = api_client.get("/jobs/no-such-job")

    assert response.status_code == 422
    assert "그런 작업이 없습니다" in response.json()["detail"]


def test_health_responds_while_an_assignment_job_is_running(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """이번 변경의 핵심 — 계산이 도는 동안에도 /health 가 붙잡히지 않고 답해야 한다."""
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=clock(18, 0), closes_at=clock(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    started = threading.Event()
    release = threading.Event()
    real_assign_period = app_module.assign_period

    def slow_assign_period(*args: Any, **kwargs: Any) -> Any:
        started.set()
        release.wait(timeout=5)
        return real_assign_period(*args, **kwargs)

    monkeypatch.setattr(app_module, "assign_period", slow_assign_period)

    submitted = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    ).json()["job"]
    assert started.wait(timeout=5)

    health = api_client.get("/health")

    release.set()
    assert health.status_code == 200
    poll_job(submitted["id"])
