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
    room = Room(name=name, opens_at=time(18, 0), closes_at=time(23, 0))
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
                "ends_at": f"{OPEN_DAY}T19:00:00",
            },
        ).status_code
        == 401
    )
    assert (
        api_client.patch(
            "/reservations/1",
            json={
                "starts_at": f"{OPEN_DAY}T18:00:00",
                "ends_at": f"{OPEN_DAY}T19:00:00",
            },
        ).status_code
        == 401
    )
    assert api_client.delete("/reservations/1").status_code == 401


def test_a_personal_reservation_is_created_as_one_row(
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
            "ends_at": f"{OPEN_DAY}T20:00:00",
        },
        cookies=owner,
    )

    assert response.status_code == 201
    rows = response.json()["reservations"]
    # 두 시간을 잡아도 행은 하나입니다. 사람이 고른 것이 구간 하나이기 때문입니다.
    assert len(rows) == 1
    assert rows[0]["start"] == f"{OPEN_DAY}T18:00:00"
    assert rows[0]["end"] == f"{OPEN_DAY}T20:00:00"
    assert rows[0]["team_id"] is None and rows[0]["member_id"] == owner_id


def test_a_reservation_that_partly_overlaps_another_is_refused(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """앞 예약과 일부만 겹쳐도 거절해야 합니다.

    예전에는 1시간 칸마다 행을 두고 (room_id, starts_at) 중복 금지로 선착순을 정했기 때문에,
    시작 시각이 다르면서 뒷부분만 겹치는 구간은 걸러내지 못했습니다. 지금은 구간 자체가
    겹치는지를 DB 가 봅니다.
    """
    _, first = account("이도현", "dohyun@example.com")
    _, second = account("박서연", "seoyeon@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T20:00:00",
        },
        cookies=first,
    )

    # 19시에 시작해 21시에 끝납니다. 시작 시각은 다르지만 19~20 시가 겹칩니다.
    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T21:00:00",
        },
        cookies=second,
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_a_reservation_may_start_when_another_ends(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """앞 예약이 끝나는 시각에 다음 예약이 시작하는 것은 겹치는 것이 아닙니다."""
    _, first = account("이도현", "dohyun@example.com")
    _, second = account("박서연", "seoyeon@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=first,
    )

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T20:00:00",
        },
        cookies=second,
    )

    assert response.status_code == 201


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
            "ends_at": f"{OPEN_DAY}T19:00:00",
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
            "ends_at": f"{OPEN_DAY}T19:00:00",
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
    """소속이 아닌 팀 번호를 보낼 경우 거절합니다. 통과할 경우 그 팀이 그 시간을 예약한
    것으로 전체 일정에 표시됩니다."""
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
            "ends_at": f"{OPEN_DAY}T19:00:00",
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
            "ends_at": f"{OPEN_DAY}T19:00:00",
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
    # slot(1시간 단위 시간 칸)이 겹쳐서 거절되었으므로 뒤의 slot 도 생성되지 않아야 합니다. 전체가 rollback 됩니다.
    remaining = api_client.get(
        f"/rooms/{room.id}/reservations",
        params={"from": OPEN_DAY, "to": OPEN_DAY},
        cookies=owner,
    ).json()["reservations"]
    assert len(remaining) == 1


def test_a_day_with_no_period_at_all_is_open_for_reservation(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """기간을 정하지 않은 날은 예약할 수 있습니다.

    예약을 막는 기간은 집중 합주기간뿐입니다. 그 기간만 자동 배정이 slot(1시간 단위 시간 칸)을 차지합니다.
    """
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
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

    assert response.status_code == 201, response.text


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
            "ends_at": "2026-09-21T19:00:00",
        },
        cookies=owner,
    )

    assert response.status_code == 422
    assert "집중 합주기간" in response.json()["detail"]


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
            "starts_at": f"{OPEN_DAY}T23:00:00",
            "ends_at": f"{OPEN_DAY}T23:00:00",
        },
        cookies=owner,
    )

    assert response.status_code == 422


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
            "ends_at": f"{OPEN_DAY}T19:00:00",
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
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=owner,
    )
    api_client.post(
        "/reservations",
        json={
            "room_id": other_room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
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
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
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
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
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
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
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
    """같은 room(합주실)·같은 시각을 동시에 예약하면 하나만 성공해야 합니다.

    room_service.test_room_name_race_at_commit_time_is_translated_not_500과 같은 구조입니다.
    완전히 동시인 두 요청은 스레드 없이 재현할 수 없어서, 독립된 두 session 이 순서대로
    commit 할 때 두 번째 commit 에서 IntegrityError 가 발생하고 그 예외가 RESERVATION_MESSAGES 의
    문장을 담은 ValueError 로 변환되는지를 직접 검증합니다. db_session 은 정리 목적으로만 받습니다.
    """
    member = _member(db_session, "이도현")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    slot_start = datetime(2026, 9, 14, 18, 0)
    slot_end = datetime(2026, 9, 14, 19)
    created_at = datetime(2026, 9, 14, 0, 0)

    session_a = Session(test_engine)
    session_b = Session(test_engine)
    try:
        create_reservation(
            session_a, room.id, member, None, None, slot_start, slot_end, created_at
        )
        with pytest.raises(ValueError, match="이미"):
            create_reservation(
                session_b, room.id, member, None, None, slot_start, slot_end, created_at
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
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T20:00:00"},
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
    """이동할 시간이 이미 예약되어 있을 경우 거절하되, 원래 예약을 유지해야 합니다. 삭제했다가 다시
    생성하는 사이에 실패하면 예약이 전부 삭제됩니다."""
    owner_id, owner = account("이도현", "dohyun@example.com")
    _, someone_else = account("박서연", "seoyeon@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=owner,
    ).json()["reservations"][0]
    api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T20:00:00",
        },
        cookies=someone_else,
    )

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T20:00:00"},
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
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T19:00:00", "ends_at": f"{OPEN_DAY}T20:00:00"},
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
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T17:00:00", "ends_at": f"{OPEN_DAY}T18:00:00"},
        cookies=owner,
    )

    assert response.status_code == 422
    assert "운영 시간" in response.json()["detail"]


def test_a_reservation_slot_can_be_stretched_over_its_own_time(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """옮길 구간이 원래 구간과 겹쳐도 통과해야 합니다.

    겹침 금지 제약은 행끼리만 봅니다. 고치는 중인 행은 하나라서 자기 자신과 비교하지 않습니다.
    """
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    _open_period(db_session)
    db_session.commit()

    created = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T19:00:00",
        },
        cookies=owner,
    ).json()["reservations"][0]

    response = api_client.patch(
        f"/reservations/{created['id']}",
        json={"starts_at": f"{OPEN_DAY}T18:00:00", "ends_at": f"{OPEN_DAY}T20:00:00"},
        cookies=owner,
    )

    assert response.status_code == 200
    moved = response.json()["reservations"]
    assert len(moved) == 1
    assert moved[0]["start"] == f"{OPEN_DAY}T18:00:00"
    assert moved[0]["end"] == f"{OPEN_DAY}T20:00:00"


def test_an_everyday_focused_period_blocks_reservations_after_its_end_date(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """everyday 집중 합주기간은 종료일 없이 계속되므로, 저장된 종료일 뒤의 날짜도 예약을 거부합니다."""
    _, owner = account("이도현", "dohyun@example.com")
    room = _room(db_session)
    period = _focused_period(db_session)  # 9/21 ~ 9/27
    period.everyday = True
    db_session.commit()

    response = api_client.post(
        "/reservations",
        json={
            "room_id": room.id,
            "starts_at": "2026-10-05T18:00:00",
            "ends_at": "2026-10-05T19:00:00",
        },
        cookies=owner,
    )

    assert response.status_code == 422
    assert "집중 합주기간" in response.json()["detail"]
