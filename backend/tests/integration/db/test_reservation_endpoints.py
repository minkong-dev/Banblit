from datetime import date, datetime, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from backend.api.reservation_service import create_reservation
from backend.db.models import Member, Period, Room, Team, TeamSlot
from conftest import AccountFactory, seat

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


def _join(session: Session, member_id: int, team: Team) -> None:
    seat(session, team.id, member_id)
    session.flush()


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


def test_reservation_endpoints_require_login(
    api_client: TestClient, db_session: Session
) -> None:
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    assert (
        api_client.get(
            f"/rooms/{room.id}/reservations", params={"from": OPEN_DAY, "to": OPEN_DAY}
        ).status_code
        == 401
    )
    assert (
        api_client.post(
            "/reservations",
            json={
                "room_id": room.id,
                "starts_at": f"{OPEN_DAY}T18:00:00",
                "ends_at": f"{OPEN_DAY}T18:30:00",
            },
        ).status_code
        == 401
    )
    assert (
        api_client.patch(
            "/reservations/1",
            json={
                "starts_at": f"{OPEN_DAY}T18:00:00",
                "ends_at": f"{OPEN_DAY}T18:30:00",
            },
        ).status_code
        == 401
    )
    assert api_client.delete("/reservations/1").status_code == 401


def test_a_personal_reservation_is_created_as_30_minute_rows(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=owner,
    )

    assert response.status_code == 201
    rows = response.json()["reservations"]
    assert [r["start"] for r in rows] == [f"{OPEN_DAY}T18:00:00", f"{OPEN_DAY}T18:30:00"]
    assert all(r["team_id"] is None and r["member_id"] == owner_id for r in rows)


def test_a_reservation_belongs_to_the_cookie_owner_not_the_first_account(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    first_id, _ = account("박서연", "seoyeon@example.com")
    booker_id, booker = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=booker,
    )

    assert response.status_code == 201
    row = response.json()["reservations"][0]
    assert row["member_id"] == booker_id
    assert row["member_id"] != first_id
    assert row["member"] == "이도현"


def test_a_team_reservation_records_the_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")
    team = _team(db_session, "새벽 네시")
    _join(db_session, owner_id, team)
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "team_id": team.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    )

    assert response.status_code == 201
    row = response.json()["reservations"][0]
    assert row["team_id"] == team.id
    assert row["team"] == "새벽 네시"


def test_a_team_reservation_rejects_someone_outside_the_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """소속이 아닌 팀 번호를 실어 보내면 거절한다 — 통과하면 그 팀이 그 시간을 쓴
    것처럼 전체 일정에 남는다."""
    _, outsider = account("이도현", "dohyun@example.com")
    team = _team(db_session, "새벽 네시")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "team_id": team.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=outsider,
    )

    assert response.status_code == 403
    assert "소속" in response.json()["detail"]


def test_reservation_creation_rejects_a_slot_already_taken(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    first = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    )
    assert first.status_code == 201

    second = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=owner,
    )

    assert second.status_code == 422
    assert "이미" in second.json()["detail"]
    # 겹친 앞칸(18:00)에서 막혔으니 뒤칸(18:30)은 만들어지지 않아야 한다 — 전부 되돌린다.
    remaining = api_client.get(
        f"/rooms/{room.id}/reservations",
        params={"from": OPEN_DAY, "to": OPEN_DAY},
        cookies=owner,
    ).json()["reservations"]
    assert len(remaining) == 1


def test_reservation_creation_rejects_a_day_outside_any_open_period(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    )

    assert response.status_code == 422
    assert "상시 개방기간" in response.json()["detail"]


def test_reservation_creation_rejects_a_day_inside_a_focused_period(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _focused_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": "2026-09-21T18:00:00",
            "ends_at": "2026-09-21T18:30:00",
        },
        cookies=owner,
    )

    assert response.status_code == 422
    assert "상시 개방기간" in response.json()["detail"]


def test_reservation_creation_rejects_a_time_outside_room_hours(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T22:00:00",
            "ends_at": f"{OPEN_DAY}T22:30:00",
        },
        cookies=owner,
    )

    assert response.status_code == 422
    assert "운영 시간" in response.json()["detail"]


def test_reservation_creation_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "team_id": 999999,
            "starts_at": f"{OPEN_DAY}T18:00:00",
            "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    )

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_reservations_in_a_room_are_listed_for_a_date_range(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    other_room = _room(db_session, "2번방")
    _open_period(db_session)
    db_session.commit()

    api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    )
    api_client.post(
        "/reservations",
        json={
            "room_id": other_room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    )

    response = api_client.get(
        f"/rooms/{room.id}/reservations",
        params={"from": OPEN_DAY, "to": OPEN_DAY},
        cookies=owner,
    )

    assert response.status_code == 200
    rows = response.json()["reservations"]
    assert len(rows) == 1
    assert rows[0]["room_id"] == room.id


def test_anyone_signed_in_can_read_another_members_reservations(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    _, onlooker = account("박서연", "seoyeon@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    )

    response = api_client.get(
        f"/rooms/{room.id}/reservations",
        params={"from": OPEN_DAY, "to": OPEN_DAY},
        cookies=onlooker,
    )

    assert response.status_code == 200
    assert len(response.json()["reservations"]) == 1


def test_a_reservation_slot_is_cancelled_by_its_owner(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.delete(f"/reservations/{created['id']}", cookies=owner)

    assert response.status_code == 204
    remaining = api_client.get(
        f"/rooms/{room.id}/reservations",
        params={"from": OPEN_DAY, "to": OPEN_DAY},
        cookies=owner,
    ).json()["reservations"]
    assert remaining == []


def test_a_reservation_slot_cancellation_rejects_someone_else(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    _, someone_else = account("박서연", "seoyeon@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.delete(
        f"/reservations/{created['id']}", cookies=someone_else
    )

    assert response.status_code == 403
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
        create_reservation(session_a, room.id, member, None, slot_start, slot_end, created_at)
        with pytest.raises(ValueError, match="이미"):
            create_reservation(
                session_b, room.id, member, None, slot_start, slot_end, created_at
            )
    finally:
        session_a.close()
        session_b.close()


def test_a_reservation_slot_is_moved_to_a_free_time_by_its_owner(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    owner_id, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T19:30:00"},
        cookies=owner,
    )

    assert response.status_code == 200
    assert [r["start"] for r in response.json()["reservations"]] == [f"{OPEN_DAY}T19:00:00"]
    listed = api_client.get(
        f"/rooms/{room.id}/reservations",
        params={"from": OPEN_DAY, "to": OPEN_DAY},
        cookies=owner,
    ).json()["reservations"]
    assert [r["start"] for r in listed] == [f"{OPEN_DAY}T19:00:00"]
    assert listed[0]["member_id"] == owner_id


def test_moving_a_reservation_slot_onto_a_taken_time_keeps_the_original(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """옮길 자리가 차 있으면 거절하되, 원래 자리를 잃지 않아야 한다 — 지우고 다시
    넣는 사이에 실패하면 예약이 통째로 사라진다."""
    owner_id, owner = account("이도현", "dohyun@example.com")
    _, someone_else = account("박서연", "seoyeon@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    ).json()["reservations"][0]
    api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T19:30:00",
        },
        cookies=someone_else,
    )

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T19:30:00"},
        cookies=owner,
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]
    listed = api_client.get(
        f"/rooms/{room.id}/reservations",
        params={"from": OPEN_DAY, "to": OPEN_DAY},
        cookies=owner,
    ).json()["reservations"]
    assert [r["start"] for r in listed] == [f"{OPEN_DAY}T18:00:00", f"{OPEN_DAY}T19:00:00"]
    assert listed[0]["member_id"] == owner_id


def test_moving_someone_elses_reservation_slot_is_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    _, someone_else = account("박서연", "seoyeon@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T19:30:00"},
        cookies=someone_else,
    )

    assert response.status_code == 403
    assert "본인" in response.json()["detail"]


def test_moving_a_reservation_slot_outside_room_hours_is_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T22:00:00", "ends_at": f"{OPEN_DAY}T22:30:00"},
        cookies=owner,
    )

    assert response.status_code == 422
    assert "운영 시간" in response.json()["detail"]


def test_a_reservation_slot_can_be_stretched_over_its_own_time(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """옮길 구간이 원래 자리와 겹쳐도 통과해야 한다 — 옛 칸을 지우기 전에 새 칸을
    넣으면 자기 자신과 부딪혀 거절된다."""
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T18:30:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00"},
        cookies=owner,
    )

    assert response.status_code == 200
    assert [r["start"] for r in response.json()["reservations"]] == [
        f"{OPEN_DAY}T18:00:00",
        f"{OPEN_DAY}T18:30:00",
    ]
