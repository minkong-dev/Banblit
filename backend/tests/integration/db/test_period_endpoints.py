from collections.abc import Callable
from datetime import date, datetime, time
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup, Member, Period, Room, Team, TeamSlot, UnavailableTime
from conftest import AccountFactory, seat


@pytest.fixture()
def head_login(
    api_client: TestClient,
    account: AccountFactory,
) -> dict[str, str]:
    """헤드매니저로 가입시키고, 그 쿠키를 클라이언트 기본값으로 실어 둔다.

    poll_job 은 쿠키를 따로 싣지 않고 /jobs 를 조회하므로, 기본 쿠키가 있어야
    작업 조회가 인증을 통과한다. 다른 계정으로 부를 때는 cookies= 로 덮어쓴다.
    """
    _, cookies = account("박서연", "head@example.com")
    api_client.cookies.update(cookies)
    return cookies


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
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/schedule")

    assert response.status_code == 200
    assert response.json() == {"rows": [], "open_slots": []}


def test_schedule_lists_current_assignments_with_names(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    period_id = _period(db_session)
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(23, 0))
    db_session.add_all([team, room])
    db_session.flush()
    db_session.add(
        Assignment(
            period_id=period_id,
            team_id=team.id,
            room_id=room.id,
            starts_at=datetime(2026, 8, 1, 19, 0),
            ends_at=datetime(2026, 8, 1, 20),
        )
    )
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/schedule")

    assert response.status_code == 200
    assert response.json()["rows"] == [
        {
            "team_id": team.id,
            "team": "A",
            "room_id": room.id,
            "room": "1번방",
            "start": "2026-08-01T19:00:00",
            "end": "2026-08-01T20:00:00",
        }
    ]


def test_schedule_of_unknown_period_is_rejected(
    api_client: TestClient, head_login: dict[str, str]
) -> None:
    response = api_client.get("/periods/999999/schedule")

    assert response.status_code == 422
    assert "기간" in response.json()["detail"]


def test_schedule_excludes_other_periods_assignments(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
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
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(23, 0))
    other_room = Room(name="2번방", opens_at=time(18, 0), closes_at=time(23, 0))
    db_session.add_all([team, room, other_room])
    db_session.flush()
    db_session.add_all(
        [
            Assignment(
                period_id=period_id,
                team_id=team.id,
                room_id=room.id,
                starts_at=datetime(2026, 8, 1, 19, 0),
                ends_at=datetime(2026, 8, 1, 20),
            ),
            Assignment(
                period_id=other_period.id,
                team_id=team.id,
                room_id=other_room.id,
                starts_at=datetime(2026, 9, 1, 19, 0),
                ends_at=datetime(2026, 9, 1, 20),
            ),
        ]
    )
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/schedule")

    assert response.status_code == 200
    assert response.json()["rows"] == [
        {
            "team_id": team.id,
            "team": "A",
            "room_id": room.id,
            "room": "1번방",
            "start": "2026-08-01T19:00:00",
            "end": "2026-08-01T20:00:00",
        }
    ]


def _team_with_member(db_session: Session, team_name: str, member_name: str) -> int:
    team = Team(name=team_name)
    member = Member(name=member_name)
    db_session.add_all([team, member])
    db_session.flush()
    seat(db_session, team.id, member.id)
    db_session.flush()
    return team.id


def test_assign_saves_the_schedule_and_reports_it(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    period_id = _period(db_session)  # 8/1 ~ 8/2
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
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
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
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
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(21, 0))  # 3칸
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(22, 0))  # 2칸
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
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
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
    seat(db_session, team.id, member_1.id)
    seat(db_session, team.id, member_2.id)
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
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
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
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
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
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
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
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
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
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(22, 0))
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
            "end": "2026-08-01T19:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_1.id,
            "room": "1번방",
            "start": "2026-08-01T19:00:00",
            "end": "2026-08-01T20:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_2.id,
            "room": "2번방",
            "start": "2026-08-01T20:00:00",
            "end": "2026-08-01T21:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_2.id,
            "room": "2번방",
            "start": "2026-08-01T21:00:00",
            "end": "2026-08-01T22:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_1.id,
            "room": "1번방",
            "start": "2026-08-02T18:00:00",
            "end": "2026-08-02T19:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_1.id,
            "room": "1번방",
            "start": "2026-08-02T19:00:00",
            "end": "2026-08-02T20:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_2.id,
            "room": "2번방",
            "start": "2026-08-02T20:00:00",
            "end": "2026-08-02T21:00:00",
        },
        {
            "team_id": team_id,
            "team": "A",
            "room_id": room_2.id,
            "room": "2번방",
            "start": "2026-08-02T21:00:00",
            "end": "2026-08-02T22:00:00",
        },
    ]


def test_rollback_without_any_backup_reports_nothing_to_undo(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.post(f"/periods/{period_id}/rollback")

    assert response.status_code == 200
    assert response.json() == {"rolled_back": False}


def test_rollback_room_time_conflict_with_another_period_is_rejected_not_500(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
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
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(22, 0))
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


def test_schedule_without_login_is_rejected(
    api_client: TestClient, db_session: Session
) -> None:
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/schedule")

    assert response.status_code == 401
    assert "로그인" in response.json()["detail"]


def test_assign_needs_assign_run(
    api_client: TestClient,
    db_session: Session,
    account: AccountFactory,
) -> None:
    period_id = _period(db_session)
    db_session.commit()
    _, head = account("박서연", "head@example.com")
    _, member = account("김민수", "member@example.com")
    body = {"team_ids": [1], "room_ids": [1]}

    assert api_client.post(f"/periods/{period_id}/assign", json=body).status_code == 401

    forbidden = api_client.post(
        f"/periods/{period_id}/assign", json=body, cookies=member
    )
    assert forbidden.status_code == 403
    assert "권한" in forbidden.json()["detail"]

    # 없는 기간으로 불러 계산을 띄우지 않고 인증만 통과하는 것을 본다.
    passed = api_client.post("/periods/999999/assign", json=body, cookies=head)
    assert passed.status_code == 422
    assert "그런 기간이 없습니다" in passed.json()["detail"]


def test_rollback_needs_rollback(
    api_client: TestClient,
    db_session: Session,
    account: AccountFactory,
) -> None:
    period_id = _period(db_session)
    db_session.commit()
    _, head = account("박서연", "head@example.com")
    _, member = account("김민수", "member@example.com")

    assert api_client.post(f"/periods/{period_id}/rollback").status_code == 401

    forbidden = api_client.post(f"/periods/{period_id}/rollback", cookies=member)
    assert forbidden.status_code == 403
    assert "권한" in forbidden.json()["detail"]

    allowed = api_client.post(f"/periods/{period_id}/rollback", cookies=head)
    assert allowed.status_code == 200


def test_schedule_reports_the_slots_left_open_by_the_assignment(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    """남는 칸이 시간표와 함께 나온다 — 화면이 그 시간만 예약으로 열 수 있어야 한다."""
    period_id = _period(db_session)  # 8/1 ~ 8/2
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))  # 하루 2칸
    db_session.add_all([team, room])
    db_session.flush()
    db_session.add(
        Assignment(
            period_id=period_id,
            team_id=team.id,
            room_id=room.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19),
        )
    )
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/schedule")

    assert response.status_code == 200
    assert response.json()["open_slots"] == [
        {
            "room_id": room.id,
            "room": "1번방",
            "start": "2026-08-01T19:00:00",
            "end": "2026-08-01T20:00:00",
        },
        {
            "room_id": room.id,
            "room": "1번방",
            "start": "2026-08-02T18:00:00",
            "end": "2026-08-02T19:00:00",
        },
        {
            "room_id": room.id,
            "room": "1번방",
            "start": "2026-08-02T19:00:00",
            "end": "2026-08-02T20:00:00",
        },
    ]


def test_backups_list_each_round_newest_first(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    """되돌리기 화면이 고를 회차 목록 — 저장 시각과 칸 수를 최신순으로."""
    period_id = _period(db_session)
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(23, 0))
    db_session.add_all([team, room])
    db_session.flush()
    db_session.add_all(
        [
            AssignmentBackup(
                period_id=period_id,
                team_id=team.id,
                room_id=room.id,
                starts_at=datetime(2026, 8, 1, 19, 0),
                ends_at=datetime(2026, 8, 1, 20),
                saved_at=datetime(2026, 8, 1, 21, 0),
            ),
            AssignmentBackup(
                period_id=period_id,
                team_id=team.id,
                room_id=room.id,
                starts_at=datetime(2026, 8, 1, 20, 0),
                ends_at=datetime(2026, 8, 1, 21),
                saved_at=datetime(2026, 8, 2, 21, 0),
            ),
            AssignmentBackup(
                period_id=period_id,
                team_id=team.id,
                room_id=room.id,
                starts_at=datetime(2026, 8, 1, 21, 0),
                ends_at=datetime(2026, 8, 1, 22),
                saved_at=datetime(2026, 8, 2, 21, 0),
            ),
        ]
    )
    db_session.commit()

    response = api_client.get(f"/periods/{period_id}/backups")

    assert response.status_code == 200
    assert response.json() == {
        "backups": [
            {"saved_at": "2026-08-02T21:00:00", "slot_count": 2},
            {"saved_at": "2026-08-01T21:00:00", "slot_count": 1},
        ]
    }


def test_backup_round_shows_the_schedule_of_that_round(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    """회차를 누르면 그때의 시간표가 나온다 — 다른 회차의 칸은 섞이지 않는다."""
    period_id = _period(db_session)
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(23, 0))
    db_session.add_all([team, room])
    db_session.flush()
    db_session.add_all(
        [
            AssignmentBackup(
                period_id=period_id,
                team_id=team.id,
                room_id=room.id,
                starts_at=datetime(2026, 8, 1, 19, 0),
                ends_at=datetime(2026, 8, 1, 20),
                saved_at=datetime(2026, 8, 1, 21, 0),
            ),
            AssignmentBackup(
                period_id=period_id,
                team_id=team.id,
                room_id=room.id,
                starts_at=datetime(2026, 8, 1, 20, 0),
                ends_at=datetime(2026, 8, 1, 21),
                saved_at=datetime(2026, 8, 2, 21, 0),
            ),
        ]
    )
    db_session.commit()

    response = api_client.get(
        f"/periods/{period_id}/backups/2026-08-01T21:00:00"
    )

    assert response.status_code == 200
    assert response.json() == {
        "rows": [
            {
                "team_id": team.id,
                "team": "A",
                "room_id": room.id,
                "room": "1번방",
                "start": "2026-08-01T19:00:00",
                "end": "2026-08-01T20:00:00",
            }
        ]
    }


def test_backup_round_that_never_happened_is_rejected(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    """없는 회차는 빈 시간표가 아니라 거절이다 — 빈 것과 없는 것은 다르다."""
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.get(
        f"/periods/{period_id}/backups/2026-08-01T21:00:00"
    )

    assert response.status_code == 422
    assert "그런 회차가 없습니다" in response.json()["detail"]


def test_backup_round_needs_rollback(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    period_id = _period(db_session)
    db_session.commit()
    # 맨 처음 가입한 사람이 모든 항목을 받는다. 자격이 없는 사람을 만들려면
    # 그 앞에 한 명이 먼저 있어야 한다.
    account("박서연", "head@example.com")
    _, member = account("김민수", "member@example.com")
    path = f"/periods/{period_id}/backups/2026-08-01T21:00:00"

    assert api_client.get(path).status_code == 401

    forbidden = api_client.get(path, cookies=member)
    assert forbidden.status_code == 403
    assert "권한" in forbidden.json()["detail"]


def test_backups_of_unknown_period_are_rejected(
    api_client: TestClient, head_login: dict[str, str]
) -> None:
    response = api_client.get("/periods/999999/backups")

    assert response.status_code == 422
    assert "그런 기간이 없습니다" in response.json()["detail"]


def test_backups_need_rollback(
    api_client: TestClient,
    db_session: Session,
    account: AccountFactory,
) -> None:
    period_id = _period(db_session)
    db_session.commit()
    _, head = account("박서연", "head@example.com")
    _, member = account("김민수", "member@example.com")

    assert api_client.get(f"/periods/{period_id}/backups").status_code == 401

    forbidden = api_client.get(f"/periods/{period_id}/backups", cookies=member)
    assert forbidden.status_code == 403
    assert "권한" in forbidden.json()["detail"]

    allowed = api_client.get(f"/periods/{period_id}/backups", cookies=head)
    assert allowed.status_code == 200
    assert allowed.json() == {"backups": []}


def _blocked_team(db_session: Session) -> tuple[int, int]:
    """8/1 운영시간 내내 불가능한 사람이 낀 팀을 만들고 (팀 번호, 그 사람 번호)를 돌려준다."""
    team = Team(name="A")
    free = Member(name="김민수")
    blocked = Member(name="이영희")
    db_session.add_all([team, free, blocked])
    db_session.flush()
    seat(db_session, team.id, free.id)
    seat(db_session, team.id, blocked.id)
    db_session.add_all(
        [
            UnavailableTime(
                member_id=blocked.id,
                starts_at=datetime(2026, 8, 1, 18, 0),
                ends_at=datetime(2026, 8, 1, 19, 0),
                repeats_weekly=False,
                repeat_until=None,
            ),
        ]
    )
    db_session.flush()
    return team.id, blocked.id


def test_confirming_a_proposal_saves_the_schedule_without_that_member(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    period_id = _period(db_session)  # 8/1 ~ 8/2
    team_id, blocked_id = _blocked_team(db_session)
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()
    body = {"team_ids": [team_id], "room_ids": [room.id]}

    refused = poll_job(
        api_client.post(f"/periods/{period_id}/assign", json=body).json()["job"]["id"]
    )
    assert refused["result"]["saved"] is False
    assert refused["result"]["proposals"][0]["excluded_member"]["id"] == blocked_id

    submitted = api_client.post(
        f"/periods/{period_id}/proposals/{blocked_id}/confirm", json=body
    )
    assert submitted.status_code == 202

    job = poll_job(submitted.json()["job"]["id"])

    assert job["status"] == "done"
    assert job["result"]["saved"] is True
    assert job["result"]["assignment"]["feasible"] is True
    saved = api_client.get(f"/periods/{period_id}/schedule").json()["rows"]
    assert len(saved) == 4  # 이틀 × 2칸을 팀 하나가 가져간다


def test_confirming_someone_outside_the_roster_fails_the_job(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()

    submitted = api_client.post(
        f"/periods/{period_id}/proposals/999999/confirm",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    )
    assert submitted.status_code == 202

    job = poll_job(submitted.json()["job"]["id"])

    assert job["status"] == "failed"
    assert "명단에 없습니다" in job["error"]


def test_confirming_a_proposal_needs_proposal_confirm(
    api_client: TestClient,
    db_session: Session,
    account: AccountFactory,
) -> None:
    period_id = _period(db_session)
    db_session.commit()
    _, head = account("박서연", "head@example.com")
    _, member = account("김민수", "member@example.com")
    path = f"/periods/{period_id}/proposals/1/confirm"
    body = {"team_ids": [1], "room_ids": [1]}

    assert api_client.post(path, json=body).status_code == 401

    forbidden = api_client.post(path, json=body, cookies=member)
    assert forbidden.status_code == 403
    assert "권한" in forbidden.json()["detail"]

    # 없는 기간으로 불러 계산을 띄우지 않고 인증만 통과하는 것을 본다.
    passed = api_client.post(
        "/periods/999999/proposals/1/confirm", json=body, cookies=head
    )
    assert passed.status_code == 422
    assert "그런 기간이 없습니다" in passed.json()["detail"]
