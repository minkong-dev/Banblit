import pytest
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from conftest import AccountFactory

from backend.db.models import Settings
from backend.contract import SLOT_MINUTE_CHOICES
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


# ── 합주 1회 진행 시간 ──────────────────────────────────────────────────────


def test_the_session_length_starts_at_one_hour(
    api_client: TestClient, account: AccountFactory
) -> None:
    """합주 1회는 보통 1시간입니다. 설정하지 않은 저장소도 그 값으로 동작해야 합니다."""
    _, viewer = account("이도현", "dohyun@example.com")

    assert api_client.get("/settings", cookies=viewer).json()["session_minutes"] == 60


def test_the_session_length_can_be_changed_on_its_own(
    api_client: TestClient, account: AccountFactory
) -> None:
    """칸 크기는 그대로 두고 합주 길이만 바꿉니다. 둘은 서로 다른 값입니다."""
    _, admin = account("이도현", "dohyun@example.com")

    response = api_client.patch("/settings", json={"session_minutes": 120}, cookies=admin)

    assert response.status_code == 200
    assert response.json() == {"slot_minutes": 60, "session_minutes": 120}


def test_a_session_shorter_than_one_slot_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    """칸 하나보다 짧은 합주는 격자 위에서 끝나지 않습니다. 30분 합주를 쓰려면 칸도 30분이어야 합니다."""
    _, admin = account("이도현", "dohyun@example.com")

    assert api_client.patch(
        "/settings", json={"session_minutes": 30}, cookies=admin
    ).status_code == 422


def test_a_session_that_is_not_a_whole_number_of_slots_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    """칸의 배수가 아니면 합주가 칸 중간에서 끝나, 남은 반 칸을 아무도 쓸 수 없습니다."""
    _, admin = account("이도현", "dohyun@example.com")
    api_client.patch("/settings", json={"slot_minutes": 20}, cookies=admin)

    assert api_client.patch(
        "/settings", json={"session_minutes": 30}, cookies=admin
    ).status_code == 422


def test_both_values_change_together_when_sent_together(
    api_client: TestClient, account: AccountFactory
) -> None:
    """30분 합주로 내리려면 칸도 함께 내려야 합니다. 한 요청에 담으면 순서 문제가 없습니다."""
    _, admin = account("이도현", "dohyun@example.com")

    response = api_client.patch(
        "/settings", json={"slot_minutes": 30, "session_minutes": 30}, cookies=admin
    )

    assert response.status_code == 200
    assert response.json() == {"slot_minutes": 30, "session_minutes": 30}


def test_a_slot_size_that_would_break_the_saved_session_length_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    """칸만 키우면 저장된 합주 길이가 배수가 아니게 됩니다. 사유를 붙여 거절합니다."""
    _, admin = account("이도현", "dohyun@example.com")
    api_client.patch("/settings", json={"slot_minutes": 30, "session_minutes": 90}, cookies=admin)

    response = api_client.patch("/settings", json={"slot_minutes": 60}, cookies=admin)

    assert response.status_code == 422
    assert api_client.get("/settings", cookies=admin).json()["slot_minutes"] == 30


def test_a_patch_with_no_value_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    """빈 요청을 200 으로 받으면 이름을 잘못 적은 요청이 조용히 무시됩니다."""
    _, admin = account("이도현", "dohyun@example.com")

    assert api_client.patch("/settings", json={}, cookies=admin).status_code == 422


def test_the_database_rejects_a_session_length_that_is_not_a_whole_number_of_slots(
    db_session: Session,
) -> None:
    """DB 도 API 와 같은 조건을 지킵니다. 직접 수정해도 격자에서 벗어난 값이 남지 않습니다."""
    with pytest.raises(IntegrityError):
        db_session.execute(update(Settings).values(slot_minutes=60, session_minutes=90))
        db_session.flush()
    db_session.rollback()
