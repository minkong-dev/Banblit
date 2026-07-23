from datetime import date, datetime, time

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import (
    Assignment,
    Member,
    Membership,
    Period,
    Position,
    Room,
    Team,
    UnavailableTime,
)


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


def test_assign_reports_open_slots_with_real_room_names(
    api_client: TestClient, db_session: Session
) -> None:
    """칸이 팀보다 많이 남는 시나리오 — open_slots가 엔진 키가 아니라 실제 방 정보로 되돌아오는지."""
    period = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 1),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    db_session.add(period)
    db_session.flush()
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "박지훈")
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 30))  # 3칸
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(21, 0))  # 2칸
    db_session.add_all([room_1, room_2])
    db_session.flush()
    db_session.commit()

    response = api_client.post(
        f"/periods/{period.id}/assign",
        json={"team_ids": [team_a, team_b], "room_ids": [room_1.id, room_2.id]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["assignment"]["feasible"] is True
    open_slots = body["assignment"]["open_slots"]
    assert len(open_slots) == 1  # 전체 5칸 - 팀당 2칸 × 2팀 = 1칸 남는다
    room_id_by_name = {"1번방": room_1.id, "2번방": room_2.id}
    slot = open_slots[0]
    # 엔진 키는 "1번방 (2026-08-01)" 형태다 — 순수한 방 이름만 나와야 한다.
    assert slot["room"] in room_id_by_name
    assert slot["room_id"] == room_id_by_name[slot["room"]]


def test_assign_reports_a_coordination_proposal_with_real_names(
    api_client: TestClient, db_session: Session
) -> None:
    """배정이 실패해 조율안이 나오는 경로 — 제외 인원과 조율안 안 배정 모두 실제 값으로 되돌아오는지."""
    period = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 1),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    db_session.add(period)
    db_session.flush()

    team = Team(name="A")
    member_1 = Member(name="김민수")
    member_2 = Member(name="이영희")
    db_session.add_all([team, member_1, member_2])
    db_session.flush()
    position_id = db_session.scalars(select(Position.id)).first()
    db_session.add_all(
        [
            Membership(
                member_id=member_1.id, team_id=team.id, position_id=position_id
            ),
            Membership(
                member_id=member_2.id, team_id=team.id, position_id=position_id
            ),
        ]
    )
    # 이영희만 운영시간 내내 불가능하게 만든다.
    db_session.add(
        UnavailableTime(
            member_id=member_2.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            repeats_weekly=False,
            repeat_until=None,
        )
    )
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    response = api_client.post(
        f"/periods/{period.id}/assign",
        json={"team_ids": [team.id], "room_ids": [room.id]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["saved"] is False
    assert body["assignment"]["feasible"] is False
    assert len(body["proposals"]) == 1
    proposal = body["proposals"][0]
    # 엔진 키는 "이영희 #<id>" 형태다 — 실제 id·이름으로 되돌아와야 한다.
    assert proposal["excluded_member"] == {"id": member_2.id, "name": "이영희"}
    slots = proposal["assignment"]["slots_by_team"]["A"]
    assert len(slots) == 2
    assert {slot["room"] for slot in slots} == {"1번방"}
    assert all(slot["room_id"] == room.id for slot in slots)


def test_assign_with_unknown_team_is_rejected(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    response = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [999999], "room_ids": [room.id]},
    )

    assert response.status_code == 422
    assert "그런 팀이 없습니다" in response.json()["detail"]


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
