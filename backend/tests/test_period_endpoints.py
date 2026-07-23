from datetime import date, datetime, time

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, Member, Membership, Period, Position, Room, Team


def _period(session: Session) -> int:
    period = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 2),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    session.add(period)
    session.flush()
    return period.id


def test_schedule_is_empty_before_any_assignment(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/schedule")

    assert response.status_code == 200
    assert response.json() == {"rows": []}


def test_schedule_lists_current_assignments_with_names(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(22, 0))
    db_session.add_all([team, room])
    db_session.flush()
    db_session.add(
        Assignment(
            period_id=period_id,
            team_id=team.id,
            room_id=room.id,
            starts_at=datetime(2026, 8, 1, 19, 0),
            ends_at=datetime(2026, 8, 1, 19, 30),
        )
    )
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/schedule")

    assert response.status_code == 200
    assert response.json() == {
        "rows": [
            {
                "team_id": team.id,
                "team": "A",
                "room_id": room.id,
                "room": "1번방",
                "start": "2026-08-01T19:00:00",
                "end": "2026-08-01T19:30:00",
            }
        ]
    }


def test_schedule_of_unknown_period_is_rejected(api_client: TestClient) -> None:
    response = api_client.get("/periods/999999/schedule")

    assert response.status_code == 422
    assert "기간" in response.json()["detail"]


def test_schedule_excludes_other_periods_assignments(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    other_period = Period(
        kind="focused",
        starts_on=date(2026, 9, 1),
        ends_on=date(2026, 9, 2),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    db_session.add(other_period)
    db_session.flush()

    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(22, 0))
    other_room = Room(name="2번방", opens_at=time(18, 0), closes_at=time(22, 0))
    db_session.add_all([team, room, other_room])
    db_session.flush()
    db_session.add_all(
        [
            Assignment(
                period_id=period_id,
                team_id=team.id,
                room_id=room.id,
                starts_at=datetime(2026, 8, 1, 19, 0),
                ends_at=datetime(2026, 8, 1, 19, 30),
            ),
            Assignment(
                period_id=other_period.id,
                team_id=team.id,
                room_id=other_room.id,
                starts_at=datetime(2026, 9, 1, 19, 0),
                ends_at=datetime(2026, 9, 1, 19, 30),
            ),
        ]
    )
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/schedule")

    assert response.status_code == 200
    assert response.json() == {
        "rows": [
            {
                "team_id": team.id,
                "team": "A",
                "room_id": room.id,
                "room": "1번방",
                "start": "2026-08-01T19:00:00",
                "end": "2026-08-01T19:30:00",
            }
        ]
    }


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


def test_assign_saves_the_schedule_and_reports_it(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)  # 8/1 ~ 8/2
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    response = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["saved"] is True
    assert body["assignment"]["feasible"] is True
    slots = body["assignment"]["slots_by_team"]["A"]
    assert len(slots) == 4  # 이틀 × 2칸
    assert {slot["room"] for slot in slots} == {"1번방"}
    assert all(slot["room_id"] == room.id for slot in slots)

    saved = api_client.get(f"/periods/{period_id}/schedule").json()["rows"]
    assert len(saved) == 4


def test_assign_on_an_open_period_is_rejected(
    api_client: TestClient, db_session: Session
) -> None:
    period = Period(
        kind="open",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 1),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    db_session.add(period)
    db_session.flush()
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    response = api_client.post(
        f"/periods/{period.id}/assign",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    )

    assert response.status_code == 422
    assert "집중" in response.json()["detail"]


def test_rollback_restores_the_previous_schedule(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()
    body = {"team_ids": [team_id], "room_ids": [room.id]}
    api_client.post(f"/periods/{period_id}/assign", json=body)
    api_client.post(f"/periods/{period_id}/assign", json=body)

    response = api_client.post(f"/periods/{period_id}/rollback")

    assert response.status_code == 200
    assert response.json() == {"rolled_back": True}
    assert len(api_client.get(f"/periods/{period_id}/schedule").json()["rows"]) == 4


def test_rollback_without_any_backup_reports_nothing_to_undo(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.post(f"/periods/{period_id}/rollback")

    assert response.status_code == 200
    assert response.json() == {"rolled_back": False}
