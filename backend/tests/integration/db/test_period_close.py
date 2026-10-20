"""집중 합주기간의 마감 일시와 확정입니다(사용자 결정 2026-10-20).

마감 일시가 지나면 자동 배정 job 이 마지막 불가능 일정으로 1회 계산해 바로 현재 배정안으로 적용하고 확정합니다.
마감 뒤에는 그 기간 날짜에 걸리는 불가능 일정을 추가, 수정, 삭제할 수 없고, 확정 뒤에는 기록 적용과 수동 계산을 받지 않습니다.
확정 해제는 사유와 함께 마감 일시까지 비우고, 전체 멤버에게 알립니다.
"""

from datetime import date, datetime, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup, Member, Notification, Period, Room, Team, TeamSlot, UnavailableTime
from backend.jobs import auto_assign
from conftest import AccountFactory

DAY = date(2026, 8, 10)


def _period(session: Session, closes_at: datetime | None = None, fixed_at: datetime | None = None, starts_on: date = DAY) -> Period:
    period = Period(
        kind="focused",
        starts_on=starts_on,
        ends_on=starts_on,
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
        closes_at=closes_at,
        fixed_at=fixed_at,
    )
    session.add(period)
    session.flush()
    return period


def _team_and_room(session: Session, member_name: str = "김민수") -> int:
    team = Team(name="A")
    member = Member(name=member_name)
    session.add_all([team, member, Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))])
    session.flush()
    session.add(TeamSlot(team_id=team.id, instrument="보컬", ordinal=1, member_id=member.id))
    session.flush()
    return member.id


# ── 자동 확정 ─────────────────────────────────────────────────────────────────


def test_the_job_fixes_a_period_whose_closing_time_has_passed(db_session: Session) -> None:
    period = _period(db_session, closes_at=datetime(2026, 8, 9, 12, 0))
    _team_and_room(db_session)
    now = datetime(2026, 8, 9, 12, 1)

    auto_assign.run_due_assignments(db_session, now)

    db_session.refresh(period)
    assert period.fixed_at == now
    assert len(db_session.scalars(select(Assignment).where(Assignment.period_id == period.id)).all()) == 1
    member_ids = set(db_session.scalars(select(Member.id)).all())
    fixed = db_session.scalars(select(Notification).where(Notification.kind == "assignment_fixed")).all()
    assert {item.member_id for item in fixed} == member_ids


def test_the_job_does_not_fix_before_the_closing_time(db_session: Session) -> None:
    period = _period(db_session, closes_at=datetime(2026, 8, 10, 22, 0))
    _team_and_room(db_session)

    auto_assign.run_due_assignments(db_session, datetime(2026, 8, 10, 10, 0))

    db_session.refresh(period)
    assert period.fixed_at is None
    assert db_session.scalars(select(Assignment)).all() == []
    assert len(db_session.scalars(select(AssignmentBackup)).all()) == 1


def test_a_fixed_period_is_not_computed_again(db_session: Session) -> None:
    _period(db_session, closes_at=datetime(2026, 8, 9, 12, 0), fixed_at=datetime(2026, 8, 9, 12, 1))
    _team_and_room(db_session)

    assert auto_assign.run_due_assignments(db_session, datetime(2026, 8, 10, 22, 0)) == []
    assert db_session.scalars(select(AssignmentBackup)).all() == []


# ── 마감 뒤 불가능 일정 ────────────────────────────────────────────────────────


def _closed(session: Session) -> Period:
    # 마감 일시가 이미 지난 기간입니다. 테스트의 지금 시각(실제 시계)보다 앞이면 됩니다.
    period = _period(session, closes_at=datetime(2026, 1, 1, 0, 0))
    session.commit()
    return period


def _body(start: str, end: str, **extra: object) -> dict[str, object]:
    return {"starts_at": start, "ends_at": end, **extra}


def test_unavailable_times_inside_a_closed_period_cannot_be_added(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    member_id, cookies = account("이도현", "dohyun@example.com")
    _closed(db_session)

    inside = api_client.post(
        f"/members/{member_id}/unavailable", json=_body("2026-08-10T18:00:00", "2026-08-10T19:00:00"), cookies=cookies
    )
    outside = api_client.post(
        f"/members/{member_id}/unavailable", json=_body("2026-08-11T18:00:00", "2026-08-11T19:00:00"), cookies=cookies
    )

    assert inside.status_code == 422
    assert "마감" in inside.json()["detail"]
    assert outside.status_code == 201


def test_a_repeating_time_that_reaches_a_closed_period_cannot_be_added(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    member_id, cookies = account("이도현", "dohyun@example.com")
    _closed(db_session)

    # 2026-08-03 은 월요일입니다. 매주 월요일 반복의 두 번째가 2026-08-10 입니다.
    response = api_client.post(
        f"/members/{member_id}/unavailable",
        json=_body("2026-08-03T18:00:00", "2026-08-03T19:00:00", repeat_weekdays=1, repeat_count=3),
        cookies=cookies,
    )

    assert response.status_code == 422


def test_unavailable_times_inside_a_closed_period_cannot_be_changed_or_deleted(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    member_id, cookies = account("이도현", "dohyun@example.com")
    row = UnavailableTime(member_id=member_id, starts_at=datetime(2026, 8, 10, 18), ends_at=datetime(2026, 8, 10, 19))
    db_session.add(row)
    _closed(db_session)

    moved_out = api_client.patch(
        f"/members/{member_id}/unavailable/{row.id}", json=_body("2026-08-11T18:00:00", "2026-08-11T19:00:00"), cookies=cookies
    )
    deleted = api_client.delete(f"/members/{member_id}/unavailable/{row.id}", cookies=cookies)

    assert moved_out.status_code == 422
    assert deleted.status_code == 422


# ── 확정 뒤 기록 적용, 수동 계산 ───────────────────────────────────────────────


def test_a_fixed_period_rejects_applying_a_record_and_a_manual_run(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    period = _period(db_session, closes_at=datetime(2026, 1, 1), fixed_at=datetime(2026, 1, 1, 0, 1))
    db_session.commit()

    applied = api_client.post(f"/periods/{period.id}/records/2026-01-01T00:00:00/apply", cookies=head)
    run = api_client.post(f"/periods/{period.id}/assign", json={"team_ids": [], "room_ids": []}, cookies=head)

    assert applied.status_code == 422
    assert "확정" in applied.json()["detail"]
    assert run.status_code == 422


# ── 확정 해제 ─────────────────────────────────────────────────────────────────


def test_unfixing_clears_the_closing_time_and_tells_every_member_the_reason(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    account("이도현", "dohyun@example.com")
    period = _period(db_session, closes_at=datetime(2026, 1, 1), fixed_at=datetime(2026, 1, 1, 0, 1))
    db_session.commit()

    response = api_client.post(f"/periods/{period.id}/unfix", json={"reason": "팀 하나가 해체되었어요"}, cookies=head)

    assert response.status_code == 200
    assert response.json()["period"]["fixed_at"] is None
    assert response.json()["period"]["closes_at"] is None
    sent = db_session.scalars(select(Notification).where(Notification.kind == "assignment_unfixed")).all()
    assert {item.member_id for item in sent} == set(db_session.scalars(select(Member.id)).all())
    assert {item.reason for item in sent} == {"팀 하나가 해체되었어요"}


@pytest.mark.parametrize("reason", ["", "   "])
def test_unfixing_requires_a_reason(
    api_client: TestClient, db_session: Session, account: AccountFactory, reason: str
) -> None:
    _, head = account("박서연", "head@example.com")
    period = _period(db_session, closes_at=datetime(2026, 1, 1), fixed_at=datetime(2026, 1, 1, 0, 1))
    db_session.commit()

    assert api_client.post(f"/periods/{period.id}/unfix", json={"reason": reason}, cookies=head).status_code == 422


def test_unfixing_needs_the_record_confirm_permission_and_a_fixed_period(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _, member = account("이도현", "dohyun@example.com")
    fixed = _period(db_session, closes_at=datetime(2026, 1, 1), fixed_at=datetime(2026, 1, 1, 0, 1))
    open_period = _period(db_session, starts_on=date(2026, 9, 1))
    db_session.commit()

    assert api_client.post(f"/periods/{fixed.id}/unfix", json={"reason": "사유"}, cookies=member).status_code == 403
    assert api_client.post(f"/periods/{open_period.id}/unfix", json={"reason": "사유"}, cookies=head).status_code == 422


# ── 마감 일시 저장 ─────────────────────────────────────────────────────────────


def _create_body(**extra: object) -> dict[str, object]:
    return {
        "kind": "focused",
        "starts_on": "2026-08-10",
        "ends_on": "2026-08-12",
        "everyday": False,
        "first_run_at": "09:00",
        "second_run_at": "21:00",
        **extra,
    }


def test_the_closing_time_is_optional_and_patch_keeps_or_clears_it(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    created = api_client.post("/periods", json=_create_body(closes_at="2026-08-09T21:00:00"), cookies=head).json()["period"]
    period_id = created["id"]
    kept = api_client.patch(f"/periods/{period_id}", json={"name": "봄 공연"}, cookies=head).json()["period"]
    cleared = api_client.patch(f"/periods/{period_id}", json={"closes_at": None}, cookies=head).json()["period"]
    without = api_client.post("/periods", json=_create_body(starts_on="2026-09-10", ends_on="2026-09-12"), cookies=head)

    assert created["closes_at"] == "2026-08-09T21:00:00"
    assert created["fixed_at"] is None
    assert kept["closes_at"] == "2026-08-09T21:00:00"
    assert cleared["closes_at"] is None
    assert without.json()["period"]["closes_at"] is None


def test_the_closing_time_of_a_fixed_period_cannot_be_changed(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    period = _period(db_session, closes_at=datetime(2026, 1, 1), fixed_at=datetime(2026, 1, 1, 0, 1))
    db_session.commit()

    response = api_client.patch(f"/periods/{period.id}", json={"closes_at": None}, cookies=head)

    assert response.status_code == 422
    assert "확정" in response.json()["detail"]


def test_a_closing_time_with_a_time_zone_is_rejected(api_client: TestClient, account: AccountFactory) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post("/periods", json=_create_body(closes_at="2026-08-09T21:00:00+09:00"), cookies=head)

    assert response.status_code == 422
