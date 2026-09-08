from collections.abc import Callable
from datetime import date, datetime, time
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api import auto_assign
from backend.api.period_service import assign_period
from backend.db.models import Notification, Period, Room, Team, TeamSlot

# account 픽스처를 부른 순서가 곧 역할이다 — 이 파일의 첫 호출이 헤드매니저다.
from conftest import AccountFactory

TODAY = date.today()
RUN_AT = time(9, 0)


def _due_time() -> datetime:
    # first_run_at 이 지난 시각. 이 값을 run_due_assignments 에 넣으면 오늘 몫이 돈다.
    return datetime.combine(TODAY, time(10, 0))


def _period(session: Session) -> int:
    period = Period(
        kind="focused",
        starts_on=TODAY,
        ends_on=TODAY,
        everyday=False,
        first_run_at=RUN_AT,
        second_run_at=time(21, 0),
    )
    session.add(period)
    session.flush()
    return period.id


def _team_with(session: Session, name: str, member_id: int) -> int:
    team = Team(name=name)
    session.add(team)
    session.flush()
    session.add(
        TeamSlot(team_id=team.id, instrument="보컬", ordinal=1, member_id=member_id)
    )
    session.flush()
    return team.id


def _room(session: Session, name: str) -> None:
    # 여닫는 시각이 한 시간이면 30분 칸 둘이다.
    session.add(Room(name=name, opens_at=time(18, 0), closes_at=time(20, 0)))
    session.flush()


def _notifications(client: TestClient, cookies: dict[str, str]) -> list[dict[str, object]]:
    res = client.get("/notifications", cookies=cookies)
    assert res.status_code == 200, res.text
    return res.json()["notifications"]


@pytest.fixture()
def assigned_member(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> tuple[int, dict[str, str]]:
    """배정 대상 팀에 든 계정 하나와 그 인증 쿠키. 기간·합주실도 함께 심는다."""
    member_id, cookies = account("김민수", "minsu@example.com")
    _period(db_session)
    _team_with(db_session, "A팀", member_id)
    _room(db_session, "1번방")
    db_session.commit()
    return member_id, cookies


def test_auto_assign_leaves_a_notification(
    api_client: TestClient,
    db_session: Session,
    assigned_member: tuple[int, dict[str, str]],
) -> None:
    member_id, cookies = assigned_member

    results = auto_assign.run_due_assignments(db_session, _due_time())

    assert results[0].saved is True
    rows = _notifications(api_client, cookies)
    assert [(row["kind"], row["read"]) for row in rows] == [
        ("assignment_updated", False)
    ]
    # 통로가 아니라 표에도 그 사람 번호로 남았는지 함께 본다.
    assert list(
        db_session.scalars(select(Notification.member_id))
    ) == [member_id]


def test_a_member_of_no_assigned_team_gets_nothing(
    api_client: TestClient,
    db_session: Session,
    assigned_member: tuple[int, dict[str, str]],
    account: AccountFactory,
) -> None:
    _, outsider_cookies = account("박서연", "seoyeon@example.com")

    auto_assign.run_due_assignments(db_session, _due_time())

    assert _notifications(api_client, outsider_cookies) == []


def test_another_persons_notification_is_not_visible(
    api_client: TestClient,
    db_session: Session,
    assigned_member: tuple[int, dict[str, str]],
    account: AccountFactory,
) -> None:
    member_id, _ = assigned_member
    _, other_cookies = account("박서연", "seoyeon@example.com")
    db_session.add(
        Notification(
            member_id=member_id,
            kind="assignment_updated",
            created_at=datetime.now(),
        )
    )
    db_session.commit()

    assert _notifications(api_client, other_cookies) == []


def test_reading_needs_a_login(api_client: TestClient) -> None:
    api_client.cookies.clear()
    assert api_client.get("/notifications").status_code == 401
    assert api_client.post("/notifications/read").status_code == 401


def test_marking_read_lowers_the_unread_count(
    api_client: TestClient,
    db_session: Session,
    assigned_member: tuple[int, dict[str, str]],
) -> None:
    _, cookies = assigned_member
    auto_assign.run_due_assignments(db_session, _due_time())
    before = _notifications(api_client, cookies)
    assert len([row for row in before if row["read"] is False]) == 1

    assert api_client.post("/notifications/read", cookies=cookies).status_code == 204

    after = _notifications(api_client, cookies)
    assert [row["read"] for row in after] == [True]


def test_a_person_pressing_recalculate_also_leaves_a_notification(
    api_client: TestClient,
    db_session: Session,
    assigned_member: tuple[int, dict[str, str]],
    poll_job: Callable[[str], dict[str, Any]],
) -> None:
    """자동으로 돈 것이든 사람이 누른 것이든, 시간표가 새로 저장되면 알린다."""
    # 이 파일의 첫 계정이 헤드매니저다 — assigned_member 가 그것을 만든다.
    _, cookies = assigned_member
    api_client.cookies.update(cookies)
    period_id = db_session.scalars(select(Period.id)).one()
    team_ids = list(db_session.scalars(select(Team.id)))
    room_ids = list(db_session.scalars(select(Room.id)))

    submitted = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": team_ids, "room_ids": room_ids},
    )
    assert submitted.status_code == 202, submitted.text
    job = poll_job(submitted.json()["job"]["id"])
    assert job["result"]["saved"] is True

    assert [row["kind"] for row in _notifications(api_client, cookies)] == [
        "assignment_updated"
    ]


def test_rolling_back_leaves_a_notification(
    api_client: TestClient,
    db_session: Session,
    assigned_member: tuple[int, dict[str, str]],
) -> None:
    """되돌리기도 사람이 보는 시간표를 바꾸므로 알린다."""
    _, cookies = assigned_member
    period_id = db_session.scalars(select(Period.id)).one()
    # 두 번 저장해야 되돌릴 백업 회차가 생긴다. 자동 배정은 같은 날 같은 시각을
    # 두 번 돌지 않으므로 저장하는 자리를 직접 두 번 부른다.
    team_ids = list(db_session.scalars(select(Team.id)))
    room_ids = list(db_session.scalars(select(Room.id)))
    for hour in (18, 19):
        assign_period(
            db_session,
            period_id,
            team_ids,
            room_ids,
            saved_at=datetime.combine(TODAY, time(hour, 0)),
        )
    before = len(_notifications(api_client, cookies))

    rolled = api_client.post(f"/periods/{period_id}/rollback", cookies=cookies)
    assert rolled.status_code == 200, rolled.text
    assert rolled.json()["rolled_back"] is True

    assert len(_notifications(api_client, cookies)) == before + 1
