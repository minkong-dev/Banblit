from datetime import date, datetime, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from backend.api.reservation_service import create_reservation
from backend.db.models import Member, Period, Room, Team

OPEN_DAY = "2026-09-14"


def _member(session: Session, name: str) -> Member:
    member = Member(name=name)
    session.add(member)
    session.flush()
    return member


def _team(session: Session, name: str) -> Team:
    team = Team(name=name)
    session.add(team)
    session.flush()
    return team


def _room(session: Session, name: str = "1번방") -> Room:
    room = Room(name=name, opens_at=time(18, 0), closes_at=time(22, 0))
    session.add(room)
    session.flush()
    return room


def _open_period(session: Session) -> Period:
    period = Period(
        kind="open",
        starts_on=date(2026, 9, 14),
        ends_on=date(2026, 9, 20),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(18, 0),
    )
    session.add(period)
    session.flush()
    return period


def _focused_period(session: Session) -> Period:
    period = Period(
        kind="focused",
        starts_on=date(2026, 9, 21),
        ends_on=date(2026, 9, 27),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(18, 0),
    )
    session.add(period)
    session.flush()
    return period


def test_a_personal_reservation_is_created_as_30_minute_rows(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T19:00:00",
        },
    )

    assert response.status_code == 201
    rows = response.json()["reservations"]
    assert [r["start"] for r in rows] == [f"{OPEN_DAY}T18:00:00", f"{OPEN_DAY}T18:30:00"]
    assert all(r["team_id"] is None and r["member"] == "이도현" for r in rows)


def test_a_team_reservation_records_the_team(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    team = _team(db_session, "새벽 네시")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "member_id": member.id,
            "team_id": team.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
    )

    assert response.status_code == 201
    row = response.json()["reservations"][0]
    assert row["team_id"] == team.id
    assert row["team"] == "새벽 네시"


def test_reservation_creation_rejects_a_slot_already_taken(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    first = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
    )
    assert first.status_code == 201

    second = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T19:00:00",
        },
    )

    assert second.status_code == 422
    assert "이미" in second.json()["detail"]
    # 겹친 앞칸(18:00)에서 막혔으니 뒤칸(18:30)은 만들어지지 않아야 한다 — 전부 되돌린다.
    remaining = api_client.get(
        f"/rooms/{room.id}/reservations", params={"from": OPEN_DAY, "to": OPEN_DAY}
    ).json()["reservations"]
    assert len(remaining) == 1


def test_reservation_creation_rejects_a_day_outside_any_open_period(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    room = _room(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
    )

    assert response.status_code == 422
    assert "상시 개방기간" in response.json()["detail"]


def test_reservation_creation_rejects_a_day_inside_a_focused_period(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    room = _room(db_session)
    _focused_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "member_id": member.id,
            "starts_at": "2026-09-21T18:00:00",
            "ends_at": "2026-09-21T18:30:00",
        },
    )

    assert response.status_code == 422
    assert "상시 개방기간" in response.json()["detail"]


def test_reservation_creation_rejects_a_time_outside_room_hours(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T22:00:00",
            "ends_at": f"{OPEN_DAY}T22:30:00",
        },
    )

    assert response.status_code == 422
    assert "운영 시간" in response.json()["detail"]


def test_reservation_creation_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "member_id": member.id,
            "team_id": 999999,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
    )

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_reservations_in_a_room_are_listed_for_a_date_range(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    room = _room(db_session)
    other_room = _room(db_session, "2번방")
    _open_period(db_session)
    db_session.commit()

    api_client.post(
        "/reservations",
        json={
            "room_id": room.id, "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
    )
    api_client.post(
        "/reservations",
        json={
            "room_id": other_room.id, "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
    )

    response = api_client.get(
        f"/rooms/{room.id}/reservations", params={"from": OPEN_DAY, "to": OPEN_DAY}
    )

    assert response.status_code == 200
    rows = response.json()["reservations"]
    assert len(rows) == 1
    assert rows[0]["room_id"] == room.id


def test_a_reservation_slot_is_cancelled_by_its_owner(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id, "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
    ).json()["reservations"][0]

    response = api_client.delete(
        f"/reservations/{created['id']}", params={"member_id": member.id}
    )

    assert response.status_code == 204
    remaining = api_client.get(
        f"/rooms/{room.id}/reservations", params={"from": OPEN_DAY, "to": OPEN_DAY}
    ).json()["reservations"]
    assert remaining == []


def test_a_reservation_slot_cancellation_rejects_someone_else(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "이도현")
    someone_else = _member(db_session, "박서연")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id, "member_id": member.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
    ).json()["reservations"][0]

    response = api_client.delete(
        f"/reservations/{created['id']}", params={"member_id": someone_else.id}
    )

    assert response.status_code == 422
    assert "본인" in response.json()["detail"]


def test_reservation_slot_race_at_commit_time_is_translated_not_500(
    test_engine: Engine, db_session: Session
) -> None:
    """두 사람이 같은 방·같은 시각을 동시에 노리면 한쪽만 성공해야 한다.

    room_service.test_room_name_race_at_commit_time_is_translated_not_500 과 같은 얼개다.
    완전히 동시인 두 요청은 스레드 없이 재현할 수 없어, 두 독립 세션이 순서대로
    커밋할 때 두 번째 커밋에서 진짜 IntegrityError가 나고 그것이 지금 쓰는 것과 같은
    문구의 ValueError로 바뀌는지를 직접 확인한다. db_session은 정리용으로만 받는다.
    """
    member = _member(db_session, "이도현")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    slot_start = datetime(2026, 9, 14, 18, 0)
    slot_end = datetime(2026, 9, 14, 18, 30)
    created_at = datetime(2026, 9, 14, 0, 0)

    session_a = Session(test_engine)
    session_b = Session(test_engine)
    try:
        create_reservation(session_a, room.id, member.id, None, slot_start, slot_end, created_at)
        with pytest.raises(ValueError, match="이미"):
            create_reservation(
                session_b, room.id, member.id, None, slot_start, slot_end, created_at
            )
    finally:
        session_a.close()
        session_b.close()
