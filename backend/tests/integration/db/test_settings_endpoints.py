import pytest
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from conftest import AccountFactory

from backend.db.models import Settings
from backend.scheduling.slots import SLOT_MINUTE_CHOICES
from test_reservation_endpoints import OPEN_DAY, _open_period, _room


def test_the_slot_size_starts_at_one_hour(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, viewer = account("이도현", "dohyun@example.com")

    response = api_client.get("/settings", cookies=viewer)

    assert response.status_code == 200
    assert response.json()["slot_minutes"] == 60


def test_the_first_account_can_change_the_slot_size(
    api_client: TestClient, account: AccountFactory
) -> None:
    # 첫 계정이 권한을 전부 받으므로 room_edit 도 가집니다(auth_service 의 _is_first_account).
    _, admin = account("이도현", "dohyun@example.com")

    response = api_client.patch("/settings", json={"slot_minutes": 10}, cookies=admin)

    assert response.status_code == 200
    assert response.json()["slot_minutes"] == 10
    assert api_client.get("/settings", cookies=admin).json()["slot_minutes"] == 10


def test_a_slot_size_that_does_not_divide_an_hour_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    """한 시간을 남김없이 나누지 못하는 값은 격자가 고르게 떨어지지 않아 거절합니다."""
    _, admin = account("이도현", "dohyun@example.com")

    response = api_client.patch("/settings", json={"slot_minutes": 7}, cookies=admin)

    assert response.status_code == 422


def test_a_member_without_room_edit_cannot_change_the_slot_size(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "seoyeon@example.com")
    _, plain = account("이도현", "dohyun@example.com")

    response = api_client.patch("/settings", json={"slot_minutes": 30}, cookies=plain)

    assert response.status_code == 403


def test_the_new_slot_size_decides_which_reservation_times_are_allowed(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """설정을 10분으로 내리면 18:10 시작이 허용되고, 60분일 때는 거절됩니다."""
    _, admin = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    body = {
        "room_id": room.id,
        "starts_at": f"{OPEN_DAY}T18:10:00",
        "ends_at": f"{OPEN_DAY}T19:00:00",
    }
    assert api_client.post("/reservations", json=body, cookies=admin).status_code == 422

    api_client.patch("/settings", json={"slot_minutes": 10}, cookies=admin)

    assert api_client.post("/reservations", json=body, cookies=admin).status_code == 201


def test_the_database_rejects_a_slot_unit_the_api_rejects(
    db_session: Session,
) -> None:
    """DB 도 API 와 같은 값만 허용합니다.

    6 은 60 의 약수라서 이전 CHECK 제약("60 % slot_minutes = 0")을 통과했으나 API 와 화면은
    거절했습니다. 목록 3곳의 내용이 달라, DB 를 직접 수정하면 화면이 표시하지 못하는 값이
    저장될 수 있었습니다.
    """
    with pytest.raises(IntegrityError):
        db_session.execute(update(Settings).values(slot_minutes=6))
        db_session.flush()
    db_session.rollback()


def test_the_database_accepts_every_slot_unit_the_api_accepts(
    db_session: Session,
) -> None:
    for minutes in SLOT_MINUTE_CHOICES:
        db_session.execute(update(Settings).values(slot_minutes=minutes))
        db_session.flush()
    db_session.rollback()
