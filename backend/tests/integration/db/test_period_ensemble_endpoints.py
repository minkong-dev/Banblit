"""집중 합주기간의 전체합주 설정 저장(patch_note 8번 B단계)을 검사합니다."""

from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Period, Room
from conftest import AccountFactory

HEAD = ("박서연", "head@example.com")
MEMBER = ("김민수", "m@example.com")


def _room(session: Session) -> Room:
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(23, 0))
    session.add(room)
    session.flush()
    return room


def _period(session: Session, kind: str = "focused", everyday: bool = False) -> Period:
    period = Period(
        kind=kind,
        starts_on=date(2026, 9, 1),
        ends_on=date(2026, 9, 10),
        everyday=everyday,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    session.add(period)
    session.flush()
    return period


def _body(room_id: int, **changes: object) -> dict[str, object]:
    return {
        "starts_on": "2026-09-08",
        "ends_on": "2026-09-10",
        "room_id": room_id,
        "starts_at": "19:00",
        "ends_at": "22:00",
        **changes,
    }


def test_ensemble_is_saved_and_listed_with_the_period(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session)
    db_session.commit()

    response = api_client.put(f"/periods/{period.id}/ensemble", json=_body(room.id), cookies=head)

    assert response.status_code == 200
    listed = api_client.get("/periods", cookies=head).json()["periods"][0]
    assert listed["ensemble"] == {
        "starts_on": "2026-09-08",
        "ends_on": "2026-09-10",
        "room_id": room.id,
        "starts_at": "19:00",
        "ends_at": "22:00",
        "days": [],
    }


def test_period_without_ensemble_lists_null(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    _period(db_session)
    db_session.commit()

    listed = api_client.get("/periods", cookies=head).json()["periods"][0]

    assert listed["ensemble"] is None


@pytest.mark.parametrize(
    ("changes", "phrase"),
    [
        ({"starts_on": "2026-08-31"}, "기간 안"),
        ({"ends_on": "2026-09-11"}, "기간 안"),
        ({"ends_on": "2026-09-07"}, "종료일"),
        ({"starts_at": "17:00"}, "운영 시간"),
        ({"ends_at": "23:30"}, "운영 시간"),
        ({"starts_at": "19:30"}, "단위"),
        ({"starts_at": "22:00", "ends_at": "19:00"}, "끝 시각"),
        ({"room_id": 999999}, "합주실"),
    ],
)
def test_ensemble_rejects_invalid_values(
    api_client: TestClient,
    db_session: Session,
    account: AccountFactory,
    changes: dict[str, object],
    phrase: str,
) -> None:
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session)
    db_session.commit()

    response = api_client.put(
        f"/periods/{period.id}/ensemble", json={**_body(room.id), **changes}, cookies=head
    )

    assert response.status_code == 422
    assert phrase in response.json()["detail"]


def test_ensemble_is_rejected_on_an_open_period(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session, kind="open")
    db_session.commit()

    response = api_client.put(f"/periods/{period.id}/ensemble", json=_body(room.id), cookies=head)

    assert response.status_code == 422
    assert "집중" in response.json()["detail"]


def test_everyday_period_accepts_an_ensemble_after_its_stored_end_date(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """"매일" 기간은 종료일이 없어(사용자 결정 2026-09-11) 범위 시작일만 기간 시작일 이후면 됩니다."""
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session, everyday=True)
    db_session.commit()

    response = api_client.put(
        f"/periods/{period.id}/ensemble",
        json=_body(room.id, starts_on="2026-12-01", ends_on="2026-12-05"),
        cookies=head,
    )

    assert response.status_code == 200


def test_period_patch_that_leaves_the_ensemble_outside_is_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session)
    db_session.commit()
    api_client.put(f"/periods/{period.id}/ensemble", json=_body(room.id), cookies=head)

    response = api_client.patch(f"/periods/{period.id}", json={"ends_on": "2026-09-09"}, cookies=head)

    assert response.status_code == 422
    assert "기간 안" in response.json()["detail"]


def test_ensemble_day_time_is_saved_replaced_and_deleted(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session)
    db_session.commit()
    api_client.put(f"/periods/{period.id}/ensemble", json=_body(room.id), cookies=head)
    path = f"/periods/{period.id}/ensemble/days/2026-09-09"

    api_client.put(path, json={"starts_at": "18:00", "ends_at": "20:00"}, cookies=head)
    replaced = api_client.put(path, json={"starts_at": "20:00", "ends_at": "23:00"}, cookies=head)

    assert replaced.status_code == 200
    assert replaced.json()["period"]["ensemble"]["days"] == [
        {"day": "2026-09-09", "starts_at": "20:00", "ends_at": "23:00"}
    ]
    deleted = api_client.delete(path, cookies=head)
    assert deleted.status_code == 200
    assert deleted.json()["period"]["ensemble"]["days"] == []


def test_ensemble_day_outside_the_range_is_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session)
    db_session.commit()
    api_client.put(f"/periods/{period.id}/ensemble", json=_body(room.id), cookies=head)

    response = api_client.put(
        f"/periods/{period.id}/ensemble/days/2026-09-07",
        json={"starts_at": "19:00", "ends_at": "21:00"},
        cookies=head,
    )

    assert response.status_code == 422
    assert "범위" in response.json()["detail"]


def test_ensemble_day_is_rejected_without_an_ensemble(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    period = _period(db_session)
    db_session.commit()

    response = api_client.put(
        f"/periods/{period.id}/ensemble/days/2026-09-09",
        json={"starts_at": "19:00", "ends_at": "21:00"},
        cookies=head,
    )

    assert response.status_code == 422
    assert "전체합주" in response.json()["detail"]


def test_narrowing_the_ensemble_drops_day_times_outside_the_new_range(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session)
    db_session.commit()
    api_client.put(f"/periods/{period.id}/ensemble", json=_body(room.id), cookies=head)
    for day in ("2026-09-08", "2026-09-10"):
        api_client.put(
            f"/periods/{period.id}/ensemble/days/{day}",
            json={"starts_at": "18:00", "ends_at": "20:00"},
            cookies=head,
        )

    response = api_client.put(
        f"/periods/{period.id}/ensemble", json=_body(room.id, ends_on="2026-09-09"), cookies=head
    )

    days = response.json()["period"]["ensemble"]["days"]
    assert [d["day"] for d in days] == ["2026-09-08"]


def test_ensemble_delete_clears_the_setting_and_its_days(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account(*HEAD)
    room = _room(db_session)
    period = _period(db_session)
    db_session.commit()
    api_client.put(f"/periods/{period.id}/ensemble", json=_body(room.id), cookies=head)
    api_client.put(
        f"/periods/{period.id}/ensemble/days/2026-09-09",
        json={"starts_at": "18:00", "ends_at": "20:00"},
        cookies=head,
    )

    response = api_client.delete(f"/periods/{period.id}/ensemble", cookies=head)

    assert response.status_code == 200
    assert response.json()["period"]["ensemble"] is None
    again = api_client.put(f"/periods/{period.id}/ensemble", json=_body(room.id), cookies=head)
    assert again.json()["period"]["ensemble"]["days"] == []


def test_partially_filled_ensemble_is_rejected_by_the_database(db_session: Session) -> None:
    period = _period(db_session)
    period.ensemble_starts_on = date(2026, 9, 8)

    with pytest.raises(IntegrityError):
        db_session.flush()


_ENSEMBLE_WRITES = [
    ("PUT", "/periods/1/ensemble", _body(1)),
    ("DELETE", "/periods/1/ensemble", None),
    ("PUT", "/periods/1/ensemble/days/2026-09-09", {"starts_at": "19:00", "ends_at": "21:00"}),
    ("DELETE", "/periods/1/ensemble/days/2026-09-09", None),
]


@pytest.mark.parametrize(("method", "path", "body"), _ENSEMBLE_WRITES)
def test_ensemble_writes_reject_a_request_without_a_login(
    api_client: TestClient, method: str, path: str, body: dict[str, object] | None
) -> None:
    response = api_client.request(method, path, json=body)

    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path", "body"), _ENSEMBLE_WRITES)
def test_ensemble_writes_are_rejected_for_a_plain_member(
    api_client: TestClient,
    account: AccountFactory,
    method: str,
    path: str,
    body: dict[str, object] | None,
) -> None:
    account(*HEAD)
    _, member = account(*MEMBER)

    response = api_client.request(method, path, json=body, cookies=member)

    assert response.status_code == 403
