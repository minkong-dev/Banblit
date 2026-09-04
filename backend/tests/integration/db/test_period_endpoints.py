from collections.abc import Callable
from datetime import date, datetime, time
from typing import Any

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
    api_client: TestClient, db_session: Session, poll_job: Callable[[str], dict[str, Any]]
) -> None:
    period_id = _period(db_session)  # 8/1 ~ 8/2
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    submitted = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    )
    assert submitted.status_code == 202

    job = poll_job(submitted.json()["job"]["id"])

    assert job["status"] == "done"
    body = job["result"]
    assert body["saved"] is True
    assert body["assignment"]["feasible"] is True
    slots = body["assignment"]["slots_by_team"]["A"]
    assert len(slots) == 4  # 이틀 × 2칸
    assert {slot["room"] for slot in slots} == {"1번방"}
    assert all(slot["room_id"] == room.id for slot in slots)

    saved = api_client.get(f"/periods/{period_id}/schedule").json()["rows"]
    assert len(saved) == 4


def test_assign_reports_open_slots_with_real_room_names(
    api_client: TestClient, db_session: Session, poll_job: Callable[[str], dict[str, Any]]
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

    submitted = api_client.post(
        f"/periods/{period.id}/assign",
        json={"team_ids": [team_a, team_b], "room_ids": [room_1.id, room_2.id]},
    )
    assert submitted.status_code == 202

    job = poll_job(submitted.json()["job"]["id"])

    assert job["status"] == "done"
    body = job["result"]
    assert body["assignment"]["feasible"] is True
    open_slots = body["assignment"]["open_slots"]
    assert len(open_slots) == 1  # 전체 5칸 - 팀당 2칸 × 2팀 = 1칸 남는다
    room_id_by_name = {"1번방": room_1.id, "2번방": room_2.id}
    slot = open_slots[0]
    # 엔진 키는 "1번방 (2026-08-01)" 형태다 — 순수한 방 이름만 나와야 한다.
    assert slot["room"] in room_id_by_name
    assert slot["room_id"] == room_id_by_name[slot["room"]]


def test_assign_reports_a_coordination_proposal_with_real_names(
    api_client: TestClient, db_session: Session, poll_job: Callable[[str], dict[str, Any]]
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

    submitted = api_client.post(
        f"/periods/{period.id}/assign",
        json={"team_ids": [team.id], "room_ids": [room.id]},
    )
    assert submitted.status_code == 202

    job = poll_job(submitted.json()["job"]["id"])

    assert job["status"] == "done"
    body = job["result"]
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


# 없는 팀 번호를 넣었을 때 job 이 failed 로 남는 경로는
# test_assign_jobs.py::test_a_rejected_assignment_becomes_a_failed_job_with_the_reason
# 가 같은 시나리오로 이미 검증한다 — 여기서 다시 두지 않는다.


def test_assign_on_an_open_period_is_rejected(
    api_client: TestClient, db_session: Session, poll_job: Callable[[str], dict[str, Any]]
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

    submitted = api_client.post(
        f"/periods/{period.id}/assign",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    )
    assert submitted.status_code == 202

    job = poll_job(submitted.json()["job"]["id"])

    assert job["status"] == "failed"
    assert "집중" in job["error"]


def test_rollback_restores_the_previous_schedule(
    api_client: TestClient, db_session: Session, poll_job: Callable[[str], dict[str, Any]]
) -> None:
    """직전 회차가 아니라 엉뚱한 회차를 복원하는 결함을 잡을 수 있어야 한다.

    합주실을 하나 더 만들어 두 번째 배정에서만 함께 지정한다 — 그러면 전체
    자리 수가 달라져(4칸 → 8칸) 두 회차의 시각·방 구성이 원천적으로 달라진다.
    회차를 셋(S1·S2·S3)으로 늘린 이유는, 회차가 둘뿐이면 백업이 1개(S1)만
    생겨 "가장 오래된 회차"와 "가장 최신 회차"를 고르는 정렬 방향이 뒤집혀도
    LIMIT 1이 그 하나뿐인 후보를 그대로 돌려주므로 결함이 드러나지 않기
    때문이다. 세 번째 배정(S3)까지 해야 백업이 2개(S1, S2)가 되어 정렬
    방향이 실제로 결과를 가른다. 되돌린 뒤에는 직전 회차(S2)와 정확히
    같아야 하고, 그보다 오래된 회차(S1)나 되돌리기 전 현재였던 회차(S3)와는
    달라야 한다 — 아래 리스트 전체 일치 단언이 이를 함께 보장한다.
    """
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 0))
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(21, 0))
    db_session.add_all([room_1, room_2])
    db_session.flush()
    db_session.commit()

    # S1: 1번방만 → 팀 하나가 이틀 × 2칸 = 4칸 전부를 받는다.
    # 매 회차 poll_job 으로 끝까지 기다린 뒤 다음 회차를 접수한다 — 세 회차의
    # 저장 순서(saved_at)가 뒤섞이면 백업 정렬이 검증하려는 것과 달라진다.
    r1 = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room_1.id]},
    )
    assert poll_job(r1.json()["job"]["id"])["result"]["saved"] is True
    # S2: 1번방 + 2번방 → 전체 자리가 8칸으로 늘어 팀이 8칸 전부를 받는다.
    #     방 구성 자체가 S1과 다르므로 결과도 원천적으로 다르다.
    r2 = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room_1.id, room_2.id]},
    )
    assert poll_job(r2.json()["job"]["id"])["result"]["saved"] is True
    # S3: 2번방만 → 세 번째 저장으로 백업 회차를 2개(S1, S2)로 만든다.
    r3 = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room_2.id]},
    )
    assert poll_job(r3.json()["job"]["id"])["result"]["saved"] is True

    response = api_client.post(f"/periods/{period_id}/rollback")

    assert response.status_code == 200
    assert response.json() == {"rolled_back": True}

    rows = api_client.get(f"/periods/{period_id}/schedule").json()["rows"]
    # 직전 회차(S2)와 정확히 같아야 한다 — 시각·방까지 구체값으로 비교한다.
    assert rows == [
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_1.id,
            "room": "1번방",
            "start": "2026-08-01T18:00:00",
            "end": "2026-08-01T18:30:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_1.id,
            "room": "1번방",
            "start": "2026-08-01T18:30:00",
            "end": "2026-08-01T19:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_2.id,
            "room": "2번방",
            "start": "2026-08-01T20:00:00",
            "end": "2026-08-01T20:30:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_2.id,
            "room": "2번방",
            "start": "2026-08-01T20:30:00",
            "end": "2026-08-01T21:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_1.id,
            "room": "1번방",
            "start": "2026-08-02T18:00:00",
            "end": "2026-08-02T18:30:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_1.id,
            "room": "1번방",
            "start": "2026-08-02T18:30:00",
            "end": "2026-08-02T19:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_2.id,
            "room": "2번방",
            "start": "2026-08-02T20:00:00",
            "end": "2026-08-02T20:30:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_2.id,
            "room": "2번방",
            "start": "2026-08-02T20:30:00",
            "end": "2026-08-02T21:00:00",
        },
    ]


def test_rollback_without_any_backup_reports_nothing_to_undo(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.post(f"/periods/{period_id}/rollback")

    assert response.status_code == 200
    assert response.json() == {"rolled_back": False}


def test_rollback_room_time_conflict_with_another_period_is_rejected_not_500(
    api_client: TestClient, db_session: Session, poll_job: Callable[[str], dict[str, Any]]
) -> None:
    """되돌리려는 백업이 다른 기간이 차지한 방·시각과 겹치면, 저장 제약 위반이
    그대로 새어 나가 500이 되면 안 된다 — 배정 경로와 같은 422로 거부해야 한다.

    재현 순서:
    1) 기간 A를 1번방으로 배정 → 현행 = 1번방
    2) 기간 A를 2번방으로 다시 배정 → 백업 = 1번방, 현행 = 2번방(1번방 자리가 빈다)
    3) 기간 B를 1번방으로 배정 → 충돌 없이 성공
    4) 기간 A를 되돌리기 → 1번방 백업을 되살리려다 기간 B와 충돌
    """
    period_a = _period(db_session)  # 8/1 ~ 8/2
    period_b = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 2),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    db_session.add(period_b)
    db_session.flush()

    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "이영희")
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(19, 0))
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(21, 0))
    db_session.add_all([room_1, room_2])
    db_session.flush()
    db_session.commit()

    r1 = api_client.post(
        f"/periods/{period_a}/assign",
        json={"team_ids": [team_a], "room_ids": [room_1.id]},
    )
    assert poll_job(r1.json()["job"]["id"])["result"]["saved"] is True

    r2 = api_client.post(
        f"/periods/{period_a}/assign",
        json={"team_ids": [team_a], "room_ids": [room_2.id]},
    )
    assert poll_job(r2.json()["job"]["id"])["result"]["saved"] is True

    r3 = api_client.post(
        f"/periods/{period_b.id}/assign",
        json={"team_ids": [team_b], "room_ids": [room_1.id]},
    )
    assert poll_job(r3.json()["job"]["id"])["result"]["saved"] is True

    response = api_client.post(f"/periods/{period_a}/rollback")

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]

    # 실패한 되돌리기가 기간 B의 현행 시간표를 건드리지 않아야 한다.
    b_rows = api_client.get(f"/periods/{period_b.id}/schedule").json()["rows"]
    assert len(b_rows) == 4  # 이틀 × 2칸
