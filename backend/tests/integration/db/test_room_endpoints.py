from datetime import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from backend.api.room_service import commit_room
from backend.db.models import Room


def _room(session: Session, name: str, opens: time, closes: time) -> Room:
    room = Room(name=name, opens_at=opens, closes_at=closes)
    session.add(room)
    session.flush()
    return room


def test_rooms_are_listed_in_id_order(
    api_client: TestClient, db_session: Session
) -> None:
    second = _room(db_session, "2번방", time(18, 0), time(22, 0))
    first = _room(db_session, "1번방", time(18, 0), time(22, 0))
    db_session.commit()

    response = api_client.get("/rooms")

    assert response.status_code == 200
    ids = [r["id"] for r in response.json()["rooms"]]
    assert ids == sorted([second.id, first.id])


def test_room_is_created_with_hh_mm_times(api_client: TestClient) -> None:
    response = api_client.post(
        "/rooms",
        json={"name": "1번방", "opens_at": "18:00", "closes_at": "23:00"},
    )

    assert response.status_code == 201
    room = response.json()["room"]
    assert room["name"] == "1번방"
    assert room["opens_at"] == "18:00"
    assert room["closes_at"] == "23:00"
    assert isinstance(room["id"], int)


def test_room_creation_rejects_off_grid_minutes(api_client: TestClient) -> None:
    response = api_client.post(
        "/rooms",
        json={"name": "1번방", "opens_at": "18:20", "closes_at": "23:00"},
    )

    assert response.status_code == 422
    assert "30분" in response.json()["detail"]


def test_room_creation_rejects_closes_at_not_later_than_opens_at(
    api_client: TestClient,
) -> None:
    response = api_client.post(
        "/rooms",
        json={"name": "1번방", "opens_at": "23:00", "closes_at": "18:00"},
    )

    assert response.status_code == 422
    assert "늦어야" in response.json()["detail"]


def test_room_creation_rejects_a_duplicate_name(
    api_client: TestClient, db_session: Session
) -> None:
    _room(db_session, "1번방", time(18, 0), time(22, 0))
    db_session.commit()

    response = api_client.post(
        "/rooms",
        json={"name": "1번방", "opens_at": "18:00", "closes_at": "20:00"},
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_room_creation_rejects_a_whitespace_only_name(api_client: TestClient) -> None:
    response = api_client.post(
        "/rooms",
        json={"name": "   ", "opens_at": "18:00", "closes_at": "20:00"},
    )

    assert response.status_code == 422
    assert "합주실 이름" in response.json()["detail"]


def test_room_creation_trims_surrounding_whitespace_from_the_name(
    api_client: TestClient,
) -> None:
    response = api_client.post(
        "/rooms",
        json={"name": "  1번방  ", "opens_at": "18:00", "closes_at": "20:00"},
    )

    assert response.status_code == 201
    assert response.json()["room"]["name"] == "1번방"


def test_room_creation_treats_a_whitespace_only_difference_as_a_duplicate(
    api_client: TestClient, db_session: Session
) -> None:
    # 화면(roomNameMessage)이 앞뒤 공백만 다른 이름도 같은 이름으로 보므로 서버도 맞춘다.
    _room(db_session, "1번방", time(18, 0), time(22, 0))
    db_session.commit()

    response = api_client.post(
        "/rooms",
        json={"name": "  1번방  ", "opens_at": "18:00", "closes_at": "20:00"},
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_room_name_race_at_commit_time_is_translated_not_500(
    test_engine: Engine, db_session: Session
) -> None:
    """이름 중복 사전 검사(SELECT)와 commit 사이에는 잠금이 없다.

    같은 이름으로 두 요청이 동시에 들어오면 둘 다 사전 검사를 통과하고, 나중 커밋에서
    rooms_name_key 위반이 실제로 난다. 완전히 동시인 두 요청은 스레드 없이 재현할 수
    없어, 두 독립 세션이 순서대로 커밋할 때 두 번째 커밋에서 진짜 IntegrityError가
    나고 그것이 지금 쓰는 것과 같은 문구의 ValueError로 바뀌는지를 직접 확인한다.
    db_session은 이 테스트가 남긴 행을 다른 테스트로부터 치우는 정리 용도로만 받는다.
    """
    session_a = Session(test_engine)
    session_b = Session(test_engine)
    try:
        session_a.add(Room(name="경합방", opens_at=time(18, 0), closes_at=time(20, 0)))
        commit_room(session_a)

        session_b.add(Room(name="경합방", opens_at=time(18, 0), closes_at=time(20, 0)))
        with pytest.raises(ValueError, match="이미 있는 합주실 이름입니다"):
            commit_room(session_b)
    finally:
        session_a.close()
        session_b.close()


def test_room_is_patched_with_only_the_sent_fields(
    api_client: TestClient, db_session: Session
) -> None:
    room = _room(db_session, "1번방", time(18, 0), time(22, 0))
    db_session.commit()

    response = api_client.patch(f"/rooms/{room.id}", json={"closes_at": "23:00"})

    assert response.status_code == 200
    body = response.json()["room"]
    assert body["name"] == "1번방"
    assert body["opens_at"] == "18:00"
    assert body["closes_at"] == "23:00"


def test_room_is_patched_with_a_new_opens_at(
    api_client: TestClient, db_session: Session
) -> None:
    room = _room(db_session, "1번방", time(18, 0), time(22, 0))
    db_session.commit()

    response = api_client.patch(f"/rooms/{room.id}", json={"opens_at": "17:00"})

    assert response.status_code == 200
    body = response.json()["room"]
    assert body["opens_at"] == "17:00"
    assert body["closes_at"] == "22:00"


def test_room_patch_keeping_its_own_name_is_not_rejected(
    api_client: TestClient, db_session: Session
) -> None:
    room = _room(db_session, "1번방", time(18, 0), time(22, 0))
    db_session.commit()

    response = api_client.patch(f"/rooms/{room.id}", json={"name": "1번방"})

    assert response.status_code == 200
    assert response.json()["room"]["name"] == "1번방"


def test_room_patch_rejects_a_name_already_used_by_another_room(
    api_client: TestClient, db_session: Session
) -> None:
    _room(db_session, "1번방", time(18, 0), time(22, 0))
    other = _room(db_session, "2번방", time(18, 0), time(22, 0))
    db_session.commit()

    response = api_client.patch(f"/rooms/{other.id}", json={"name": "1번방"})

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_room_patch_rejects_a_whitespace_only_name(
    api_client: TestClient, db_session: Session
) -> None:
    room = _room(db_session, "1번방", time(18, 0), time(22, 0))
    db_session.commit()

    response = api_client.patch(f"/rooms/{room.id}", json={"name": "   "})

    assert response.status_code == 422
    assert "합주실 이름" in response.json()["detail"]


def test_room_patch_of_unknown_id_is_rejected(api_client: TestClient) -> None:
    response = api_client.patch("/rooms/999999", json={"name": "없는방"})

    assert response.status_code == 422
    assert "합주실" in response.json()["detail"]
