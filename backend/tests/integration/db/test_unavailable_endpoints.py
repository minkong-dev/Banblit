from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.db.models import Member, UnavailableTime


def _member(session: Session, name: str) -> Member:
    member = Member(name=name)
    session.add(member)
    session.flush()
    return member


def test_unavailable_times_are_listed_for_a_member_in_time_order(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    other = _member(db_session, "박서연")
    db_session.add_all(
        [
            UnavailableTime(
                member_id=member.id,
                starts_at=datetime(2026, 9, 20, 18, 0),
                ends_at=datetime(2026, 9, 20, 19, 0),
            ),
            UnavailableTime(
                member_id=member.id,
                starts_at=datetime(2026, 9, 14, 18, 0),
                ends_at=datetime(2026, 9, 14, 19, 0),
            ),
            UnavailableTime(
                member_id=other.id,
                starts_at=datetime(2026, 9, 14, 18, 0),
                ends_at=datetime(2026, 9, 14, 19, 0),
            ),
        ]
    )
    db_session.commit()

    response = api_client.get(f"/members/{member.id}/unavailable")

    assert response.status_code == 200
    starts = [row["starts_at"] for row in response.json()["times"]]
    assert starts == ["2026-09-14T18:00:00", "2026-09-20T18:00:00"]


def test_unavailable_time_is_created_with_half_hour_bounds(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    db_session.commit()

    response = api_client.post(
        f"/members/{member.id}/unavailable",
        json={"starts_at": "2026-09-14T18:00:00", "ends_at": "2026-09-14T19:30:00"},
    )

    assert response.status_code == 201
    body = response.json()["time"]
    assert body["member_id"] == member.id
    assert body["starts_at"] == "2026-09-14T18:00:00"
    assert body["ends_at"] == "2026-09-14T19:30:00"
    assert body["repeats_weekly"] is False
    assert body["repeat_until"] is None


def test_unavailable_time_creation_rejects_off_grid_minutes(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    db_session.commit()

    response = api_client.post(
        f"/members/{member.id}/unavailable",
        json={"starts_at": "2026-09-14T18:10:00", "ends_at": "2026-09-14T19:00:00"},
    )

    assert response.status_code == 422
    assert "30분" in response.json()["detail"]


def test_unavailable_time_creation_rejects_an_end_not_after_the_start(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    db_session.commit()

    response = api_client.post(
        f"/members/{member.id}/unavailable",
        json={"starts_at": "2026-09-14T19:00:00", "ends_at": "2026-09-14T18:00:00"},
    )

    assert response.status_code == 422


def test_unavailable_time_creation_rejects_a_repeat_until_when_not_weekly(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    db_session.commit()

    response = api_client.post(
        f"/members/{member.id}/unavailable",
        json={
            "starts_at": "2026-09-14T18:00:00",
            "ends_at": "2026-09-14T19:00:00",
            "repeats_weekly": False,
            "repeat_until": "2026-12-31",
        },
    )

    assert response.status_code == 422
    assert "반복" in response.json()["detail"]


def test_unavailable_time_creation_of_unknown_member_is_rejected(
    api_client: TestClient,
) -> None:
    response = api_client.post(
        "/members/999999/unavailable",
        json={"starts_at": "2026-09-14T18:00:00", "ends_at": "2026-09-14T19:00:00"},
    )

    assert response.status_code == 422
    assert "사람" in response.json()["detail"]


def test_unavailable_time_is_deleted(api_client: TestClient, db_session: Session) -> None:
    member = _member(db_session, "이도현")
    row = UnavailableTime(
        member_id=member.id,
        starts_at=datetime(2026, 9, 14, 18, 0),
        ends_at=datetime(2026, 9, 14, 19, 0),
    )
    db_session.add(row)
    db_session.commit()

    response = api_client.delete(f"/members/{member.id}/unavailable/{row.id}")

    assert response.status_code == 204
    assert api_client.get(f"/members/{member.id}/unavailable").json()["times"] == []


def test_unavailable_time_deletion_rejects_another_members_time(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    other = _member(db_session, "박서연")
    row = UnavailableTime(
        member_id=other.id,
        starts_at=datetime(2026, 9, 14, 18, 0),
        ends_at=datetime(2026, 9, 14, 19, 0),
    )
    db_session.add(row)
    db_session.commit()

    response = api_client.delete(f"/members/{member.id}/unavailable/{row.id}")

    assert response.status_code == 422
