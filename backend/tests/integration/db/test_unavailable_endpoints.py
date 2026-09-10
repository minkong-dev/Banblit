from datetime import datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.db.models import UnavailableTime
from conftest import AccountFactory


def _unavailable(session: Session, member_id: int, start: datetime, end: datetime) -> UnavailableTime:
    row = UnavailableTime(member_id=member_id, starts_at=start, ends_at=end)
    session.add(row)
    session.flush()
    return row


def test_unavailable_endpoints_require_login(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, _ = account("이도현", "dohyun@example.com")

    assert api_client.get(f"/members/{owner_id}/unavailable").status_code == 401
    assert (
        api_client.post(
            f"/members/{owner_id}/unavailable",
            json={"starts_at": "2026-09-14T18:00:00", "ends_at": "2026-09-14T19:00:00"},
        ).status_code
        == 401
    )
    assert api_client.delete(f"/members/{owner_id}/unavailable/1").status_code == 401


def test_unavailable_endpoints_reject_another_members_times(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    owner_id, _ = account("이도현", "dohyun@example.com")
    _, intruder = account("박서연", "seoyeon@example.com")
    row = _unavailable(
        db_session, owner_id, datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 0)
    )
    db_session.commit()

    assert (
        api_client.get(f"/members/{owner_id}/unavailable", cookies=intruder).status_code == 403
    )
    assert (
        api_client.post(
            f"/members/{owner_id}/unavailable",
            json={"starts_at": "2026-09-14T20:00:00", "ends_at": "2026-09-14T21:00:00"},
            cookies=intruder,
        ).status_code
        == 403
    )
    assert (
        api_client.delete(
            f"/members/{owner_id}/unavailable/{row.id}", cookies=intruder
        ).status_code
        == 403
    )


def test_unavailable_times_are_listed_for_a_member_in_time_order(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")
    other_id, _ = account("박서연", "seoyeon@example.com")
    _unavailable(
        db_session, owner_id, datetime(2026, 9, 20, 18, 0), datetime(2026, 9, 20, 19, 0)
    )
    _unavailable(
        db_session, owner_id, datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 0)
    )
    _unavailable(
        db_session, other_id, datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 0)
    )
    db_session.commit()

    response = api_client.get(f"/members/{owner_id}/unavailable", cookies=owner)

    assert response.status_code == 200
    starts = [row["starts_at"] for row in response.json()["times"]]
    assert starts == ["2026-09-14T18:00:00", "2026-09-20T18:00:00"]


def test_unavailable_time_is_created_with_on_the_hour_bounds(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")

    response = api_client.post(
        f"/members/{owner_id}/unavailable",
        json={"starts_at": "2026-09-14T18:00:00", "ends_at": "2026-09-14T20:00:00"},
        cookies=owner,
    )

    assert response.status_code == 201
    body = response.json()["time"]
    assert body["member_id"] == owner_id
    assert body["starts_at"] == "2026-09-14T18:00:00"
    assert body["ends_at"] == "2026-09-14T20:00:00"
    assert body["repeats_daily"] is False
    assert body["repeats_weekly"] is False
    assert body["repeat_until"] is None
    assert body["reason"] is None


def test_unavailable_time_keeps_the_reason_it_was_given(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")

    response = api_client.post(
        f"/members/{owner_id}/unavailable",
        json={
            "starts_at": "2026-09-14T18:00:00",
            "ends_at": "2026-09-14T20:00:00",
            "repeats_daily": True,
            "reason": "  기말고사  ",
        },
        cookies=owner,
    )

    assert response.status_code == 201
    body = response.json()["time"]
    assert body["repeats_daily"] is True
    # 앞뒤 공백은 걷어낸다.
    assert body["reason"] == "기말고사"


def test_unavailable_time_with_a_blank_reason_stores_nothing(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")

    response = api_client.post(
        f"/members/{owner_id}/unavailable",
        json={
            "starts_at": "2026-09-14T18:00:00",
            "ends_at": "2026-09-14T20:00:00",
            "reason": "   ",
        },
        cookies=owner,
    )

    assert response.status_code == 201
    assert response.json()["time"]["reason"] is None


def test_unavailable_time_creation_rejects_daily_and_weekly_together(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")

    response = api_client.post(
        f"/members/{owner_id}/unavailable",
        json={
            "starts_at": "2026-09-14T18:00:00",
            "ends_at": "2026-09-14T20:00:00",
            "repeats_daily": True,
            "repeats_weekly": True,
        },
        cookies=owner,
    )

    assert response.status_code == 422
    assert "함께 켤 수 없습니다" in response.json()["detail"]


def test_unavailable_time_creation_rejects_off_grid_minutes(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")

    response = api_client.post(
        f"/members/{owner_id}/unavailable",
        json={"starts_at": "2026-09-14T18:10:00", "ends_at": "2026-09-14T19:00:00"},
        cookies=owner,
    )

    assert response.status_code == 422
    assert "정시" in response.json()["detail"]


def test_unavailable_time_creation_rejects_an_end_not_after_the_start(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")

    response = api_client.post(
        f"/members/{owner_id}/unavailable",
        json={"starts_at": "2026-09-14T19:00:00", "ends_at": "2026-09-14T18:00:00"},
        cookies=owner,
    )

    assert response.status_code == 422


def test_unavailable_time_creation_rejects_a_repeat_until_when_not_weekly(
    api_client: TestClient, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")

    response = api_client.post(
        f"/members/{owner_id}/unavailable",
        json={
            "starts_at": "2026-09-14T18:00:00",
            "ends_at": "2026-09-14T19:00:00",
            "repeats_weekly": False,
            "repeat_until": "2026-12-31",
        },
        cookies=owner,
    )

    assert response.status_code == 422
    assert "반복" in response.json()["detail"]


def test_unavailable_time_creation_of_an_unknown_member_is_rejected(
    api_client: TestClient, account: AccountFactory
) -> None:
    # 없는 사람 번호도 "내 번호가 아닌 것"이라 본인 확인에서 먼저 걸린다.
    _, owner = account("이도현", "dohyun@example.com")

    response = api_client.post(
        "/members/999999/unavailable",
        json={"starts_at": "2026-09-14T18:00:00", "ends_at": "2026-09-14T19:00:00"},
        cookies=owner,
    )

    assert response.status_code == 403
    assert "본인" in response.json()["detail"]


def test_unavailable_time_is_deleted(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")
    row = _unavailable(
        db_session, owner_id, datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 0)
    )
    db_session.commit()

    response = api_client.delete(
        f"/members/{owner_id}/unavailable/{row.id}", cookies=owner
    )

    assert response.status_code == 204
    assert (
        api_client.get(f"/members/{owner_id}/unavailable", cookies=owner).json()["times"] == []
    )


def test_unavailable_time_deletion_rejects_another_members_time(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")
    other_id, _ = account("박서연", "seoyeon@example.com")
    row = _unavailable(
        db_session, other_id, datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 0)
    )
    db_session.commit()

    response = api_client.delete(
        f"/members/{owner_id}/unavailable/{row.id}", cookies=owner
    )

    assert response.status_code == 422
