from collections.abc import Callable
from datetime import date, datetime, time, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup, Member, Period, Room, Settings, Team, TeamSlot, UnavailableTime
from conftest import AccountFactory, seat


@pytest.fixture()
def head_login(
    api_client: TestClient,
    account: AccountFactory,
) -> dict[str, str]:
    """헤드매니저 계정으로 가입시키고, 그 cookie 를 클라이언트 기본값으로 설정합니다.

    poll_job 은 cookie 를 따로 전달하지 않고 /jobs 를 조회하므로, 기본 cookie 가 있어야
    작업 조회가 인증을 통과합니다. 다른 계정으로 호출할 때는 cookies= 매개변수로
    덮어씁니다.
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
    assert response.json() == {"rows": [], "open_slots": [], "report": None}


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
    slots = body["assignment"]["slots_by_team"]["A"]
    assert len(slots) == 4  # 2일 × slot(1시간 단위 시간 칸) 2개
    assert {slot["room"] for slot in slots} == {"1번방"}
    assert all(slot["room_id"] == room.id for slot in slots)

    # 연산 결과는 기록으로만 쌓이고, 적용해야 현재 배정안이 됩니다(사용자 결정 2026-10-13).
    assert api_client.get(f"/periods/{period_id}/schedule").json()["rows"] == []
    applied = api_client.post(f"/periods/{period_id}/records/{body['record_saved_at']}/apply")
    assert applied.json() == {"applied": True}
    saved = api_client.get(f"/periods/{period_id}/schedule").json()["rows"]
    # 계산 결과는 칸 4개지만 저장은 구간 한 행씩이라, 이어진 2칸이 합쳐져 하루 한 행씩 2행입니다.
    assert len(saved) == 2


def test_assign_reports_open_slots_with_real_room_names(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    """slot(1시간 단위 시간 칸)이 팀보다 많이 남는 시나리오입니다. open_slots 가 엔진
    내부 식별자가 아니라 실제 합주실 정보로 반환되는지 확인합니다."""
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
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(21, 0))  # 3개 slot
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(22, 0))  # 2개 slot
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
    open_slots = body["assignment"]["open_slots"]
    assert len(open_slots) == 1  # 전체 5개 slot - 팀당 2개 slot × 2팀 = 1개 slot 남음
    room_id_by_name = {"1번방": room_1.id, "2번방": room_2.id}
    slot = open_slots[0]
    # 엔진 내부 식별자는 "1번방 (2026-08-01)" 형태입니다. 응답에는 합주실명만 반환되어야 합니다.
    assert slot["room"] in room_id_by_name
    assert slot["room_id"] == room_id_by_name[slot["room"]]


def test_a_short_assignment_is_reported_and_kept_as_an_unsaved_record(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    """목표를 채우지 못한 결과의 부족분이 실제 팀 번호와 이름으로 반환되는지 확인합니다."""
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
    # 이영희만 운영시간 내내 불가능하게 설정합니다.
    db_session.add(
        UnavailableTime(
            member_id=member_2.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            repeat_weekdays=None,
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
    assert body["record_saved_at"] is not None
    # 이영희가 18시에 불가능해 팀 A 는 목표 2시간 중 19시 1시간만 받습니다. 응답에는 실제 id 와 이름으로 반환되어야 합니다.
    assert body["report"]["shortfalls"] == [{"team_id": team.id, "team": "A", "assigned_hours": 1.0}]
    slots = body["assignment"]["slots_by_team"]["A"]
    assert [slot["room_id"] for slot in slots] == [room.id]
    rows = api_client.get(f"/periods/{period.id}/schedule").json()["rows"]
    assert rows == []  # 메인 캘린더는 그대로입니다


# 없는 팀 번호를 넣었을 때 job 이 failed 로 남는 경로는
# test_assign_jobs.py::test_a_rejected_assignment_becomes_a_failed_job_with_the_reason
# 가 같은 시나리오로 이미 검증합니다. 이 파일에서 다시 검증하지 않습니다.


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


def _run(
    api_client: TestClient,
    poll_job: Callable[[str], dict[str, Any]],
    period_id: int,
    team_ids: list[int],
    room_ids: list[int],
) -> str:
    """연산 1회를 접수하고 끝날 때까지 기다린 뒤, 쌓인 기록의 saved_at 을 반환합니다."""
    submitted = api_client.post(
        f"/periods/{period_id}/assign", json={"team_ids": team_ids, "room_ids": room_ids}
    )
    saved_at = poll_job(submitted.json()["job"]["id"])["result"]["record_saved_at"]
    assert saved_at is not None
    return str(saved_at)


def test_applying_an_older_record_makes_exactly_that_record_the_schedule(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    """기록 3개 중 가운데 기록(S2)을 적용하면 현재 배정안이 S2 와 정확히 같아야 합니다.

    합주실 구성을 연산마다 달리해 세 기록의 시각과 합주실이 서로 다르게 합니다. 다른 기록의 칸이 섞이거나
    가장 최근 기록이 적용되는 결함을 아래 목록 전체 일치 assert 가 검출합니다.
    """
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    # 2번방은 1칸만 엽니다. 팀당 하루 상한(기본 3시간) 안에 두 방의 칸이 전부 들어가야 S2 가 모든 칸을 받습니다.
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(21, 0))
    db_session.add_all([room_1, room_2])
    db_session.flush()
    db_session.commit()

    _run(api_client, poll_job, period_id, [team_id], [room_1.id])
    s2 = _run(api_client, poll_job, period_id, [team_id], [room_1.id, room_2.id])
    _run(api_client, poll_job, period_id, [team_id], [room_2.id])

    response = api_client.post(f"/periods/{period_id}/records/{s2}/apply")

    assert response.json() == {"applied": True}
    rows = api_client.get(f"/periods/{period_id}/schedule").json()["rows"]
    # 합주실마다 이어진 칸이 구간 한 행이라, 6칸이 하루 2행씩 4행으로 저장됩니다.
    assert [(row["room"], row["start"], row["end"]) for row in rows] == [
        ("1번방", "2026-08-01T18:00:00", "2026-08-01T20:00:00"),
        ("2번방", "2026-08-01T20:00:00", "2026-08-01T21:00:00"),
        ("1번방", "2026-08-02T18:00:00", "2026-08-02T20:00:00"),
        ("2번방", "2026-08-02T20:00:00", "2026-08-02T21:00:00"),
    ]


def test_applying_a_record_that_clashes_with_another_period_is_rejected_not_500(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    """적용하려는 기록이 다른 기간이 차지한 합주실·시각과 겹치면 500 이 아니라 422 로 거부합니다.

    재현 순서:
    1) 기간 A 에서 1번방 결과(R1)와 2번방 결과(R2)를 쌓고 R2 를 적용합니다(1번방 자리가 빕니다).
    2) 기간 A 의 날짜를 변경하고, 비워진 8/1~8/2 에 기간 B 를 만들어 1번방 결과를 적용합니다.
       집중 합주기간끼리는 날짜가 겹칠 수 없어(migration b5e1d9a37c42) 날짜 변경으로 재현합니다.
    3) 기간 A 의 R1 을 적용합니다. 옛 날짜의 1번방을 쓰려다 기간 B 와 충돌합니다.
    """
    period_a = _period(db_session)  # 8/1 ~ 8/2
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "이영희")
    room_1 = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    room_2 = Room(name="2번방", opens_at=time(20, 0), closes_at=time(22, 0))
    db_session.add_all([room_1, room_2])
    db_session.flush()
    db_session.commit()

    r1 = _run(api_client, poll_job, period_a, [team_a], [room_1.id])
    r2 = _run(api_client, poll_job, period_a, [team_a], [room_2.id])
    assert api_client.post(f"/periods/{period_a}/records/{r2}/apply").json() == {"applied": True}

    moved = db_session.get(Period, period_a)
    assert moved is not None
    moved.starts_on, moved.ends_on = date(2026, 9, 1), date(2026, 9, 2)
    db_session.flush()
    period_b = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 2),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    db_session.add(period_b)
    db_session.commit()
    rb = _run(api_client, poll_job, period_b.id, [team_b], [room_1.id])
    assert api_client.post(f"/periods/{period_b.id}/records/{rb}/apply").json() == {"applied": True}

    response = api_client.post(f"/periods/{period_a}/records/{r1}/apply")

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]
    # 실패한 적용이 기간 B 의 현재 배정안을 변경하지 않아야 합니다.
    b_rows = api_client.get(f"/periods/{period_b.id}/schedule").json()["rows"]
    assert len(b_rows) == 2  # 이틀 × 2칸이 하루 한 구간씩 2행


def test_the_rollback_endpoint_is_gone(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    # 이전 확정본과 되돌리기는 삭제했습니다. 예전 시간표로 돌아가려면 그 기록을 다시 적용합니다(사용자 결정 2026-10-13).
    period_id = _period(db_session)
    db_session.commit()

    assert api_client.post(f"/periods/{period_id}/rollback").status_code == 404


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

    # 없는 기간으로 호출해 계산을 실행하지 않고 권한 검증만 통과하는지 확인합니다.
    passed = api_client.post("/periods/999999/assign", json=body, cookies=head)
    assert passed.status_code == 422
    assert "존재하지 않는 기간이에요" in passed.json()["detail"]


def test_schedule_reports_the_slots_left_open_by_the_assignment(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    """남는 칸이 시간표와 함께 나옵니다 — 화면이 그 시간만 예약으로 열 수 있어야 합니다."""
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


def test_records_list_each_round_newest_first(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    """적용할 기록을 고르는 목록입니다. 저장 시각, 칸 수, 확정 시각, 지금의 불가능 일정으로 매긴 점수를 최신순으로 반환합니다."""
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

    response = api_client.get(f"/periods/{period_id}/records")

    assert response.status_code == 200
    assert response.json() == {
        "records": [
            {
                "saved_at": "2026-08-02T21:00:00",
                "slot_count": 2,
                "applied_at": None,
                "score": {"fewest": 2, "sessions": 2, "absences": 0, "joined": 1},
            },
            {
                "saved_at": "2026-08-01T21:00:00",
                "slot_count": 1,
                "applied_at": None,
                "score": {"fewest": 1, "sessions": 1, "absences": 0, "joined": 0},
            },
        ]
    }


def test_backup_round_shows_the_schedule_of_that_round(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    """배정기록을 누르면 그때의 시간표가 나옵니다 — 다른 배정기록의 칸은 섞이지 않습니다."""
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
        f"/periods/{period_id}/records/2026-08-01T21:00:00"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["report"] is not None
    assert {"rows": body["rows"]} == {
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
    """없는 배정기록은 빈 시간표가 아니라 거절입니다 — 빈 것과 없는 것은 다릅니다."""
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.get(
        f"/periods/{period_id}/records/2026-08-01T21:00:00"
    )

    assert response.status_code == 422
    assert "존재하지 않는 배정기록이에요" in response.json()["detail"]


def test_backup_round_needs_proposal_confirm(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    period_id = _period(db_session)
    db_session.commit()
    # 맨 처음 가입한 사람이 모든 권한을 받습니다. 권한이 없는 사람을 만들려면
    # 그 앞에 한 명이 먼저 가입해야 합니다.
    account("박서연", "head@example.com")
    _, member = account("김민수", "member@example.com")
    path = f"/periods/{period_id}/records/2026-08-01T21:00:00"

    assert api_client.get(path).status_code == 401

    forbidden = api_client.get(path, cookies=member)
    assert forbidden.status_code == 403
    assert "권한" in forbidden.json()["detail"]


def test_records_of_unknown_period_are_rejected(
    api_client: TestClient, head_login: dict[str, str]
) -> None:
    response = api_client.get("/periods/999999/records")

    assert response.status_code == 422
    assert "존재하지 않는 기간이에요" in response.json()["detail"]


def test_records_need_proposal_confirm(
    api_client: TestClient,
    db_session: Session,
    account: AccountFactory,
) -> None:
    period_id = _period(db_session)
    db_session.commit()
    _, head = account("박서연", "head@example.com")
    _, member = account("김민수", "member@example.com")

    assert api_client.get(f"/periods/{period_id}/records").status_code == 401

    forbidden = api_client.get(f"/periods/{period_id}/records", cookies=member)
    assert forbidden.status_code == 403
    assert "권한" in forbidden.json()["detail"]

    allowed = api_client.get(f"/periods/{period_id}/records", cookies=head)
    assert allowed.status_code == 200
    assert allowed.json() == {"records": []}


def _blocked_team(db_session: Session) -> tuple[int, int]:
    """8/1 운영시간 내내 불가능한 사람이 낀 팀을 만들고 (팀 번호, 그 사람 번호)를 돌려줍니다."""
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
                repeat_weekdays=None,
                repeat_until=None,
            ),
        ]
    )
    db_session.flush()
    return team.id, blocked.id


def test_applying_a_short_record_makes_it_the_schedule(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    period_id = _period(db_session)  # 8/1 ~ 8/2
    team_id, _ = _blocked_team(db_session)
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    db_session.add(room)
    db_session.flush()
    db_session.commit()
    body = {"team_ids": [team_id], "room_ids": [room.id]}

    refused = poll_job(
        api_client.post(f"/periods/{period_id}/assign", json=body).json()["job"]["id"]
    )
    saved_at = refused["result"]["record_saved_at"]

    response = api_client.post(f"/periods/{period_id}/records/{saved_at}/apply")

    assert response.status_code == 200
    assert response.json() == {"applied": True}
    saved = api_client.get(f"/periods/{period_id}/schedule").json()["rows"]
    assert len(saved) == 2  # 8/1 19시 1칸과 8/2 18~20시 2칸(구간 한 행)


def test_the_old_proposal_confirm_endpoint_is_gone(
    api_client: TestClient, db_session: Session, head_login: dict[str, str]
) -> None:
    period_id = _period(db_session)
    db_session.commit()

    response = api_client.post(
        f"/periods/{period_id}/proposals/1/confirm", json={"team_ids": [1], "room_ids": [1]}
    )

    assert response.status_code == 404


def test_applying_a_record_needs_proposal_confirm_and_keeps_the_record(
    api_client: TestClient,
    db_session: Session,
    account: AccountFactory,
) -> None:
    period_id = _period(db_session)
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    db_session.add_all([team, room])
    db_session.flush()
    db_session.add(
        AssignmentBackup(
            period_id=period_id,
            team_id=team.id,
            room_id=room.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            saved_at=datetime(2026, 8, 1, 21, 0),
        )
    )
    db_session.commit()
    # 맨 처음 가입한 사람이 모든 권한을 받습니다. 권한이 없는 사람을 만들려면 그 앞에 한 명이 먼저 가입해야 합니다.
    _, head = account("박서연", "head@example.com")
    _, member = account("김민수", "member@example.com")
    path = f"/periods/{period_id}/records/2026-08-01T21:00:00/apply"

    assert api_client.post(path).status_code == 401
    forbidden = api_client.post(path, cookies=member)
    assert forbidden.status_code == 403
    assert api_client.post(path, cookies=head).json() == {"applied": True}
    # 적용한 기록도 목록에 남아 같은 기록을 다시 적용할 수 있습니다.
    assert api_client.post(path, cookies=head).json() == {"applied": True}
    missing = api_client.post(path.replace("21:00:00", "22:00:00"), cookies=head)
    assert missing.status_code == 422
    assert "존재하지 않는 배정기록이에요" in missing.json()["detail"]


def test_assign_gives_a_team_one_uninterrupted_session_per_turn(
    api_client: TestClient,
    db_session: Session,
    poll_job: Callable[[str], dict[str, Any]],
    head_login: dict[str, str],
) -> None:
    # 30분 칸에 60분 session 이면, 팀은 흩어진 30분 칸 4개가 아니라 60분 구간 4개를 받습니다.
    period_id = _period(db_session)  # 8/1 ~ 8/2
    team_id = _team_with_member(db_session, "A", "김민수")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(20, 0))
    db_session.add(room)
    db_session.execute(update(Settings).values(slot_minutes=30, session_minutes=60))
    db_session.flush()
    db_session.commit()

    submitted = api_client.post(
        f"/periods/{period_id}/assign",
        json={"team_ids": [team_id], "room_ids": [room.id]},
    )
    job = poll_job(submitted.json()["job"]["id"])

    assert job["status"] == "done"
    slots = job["result"]["assignment"]["slots_by_team"]["A"]
    assert len(slots) == 4  # 2일 × 60분 session 2회
    for slot in slots:
        start = datetime.fromisoformat(slot["start"])
        end = datetime.fromisoformat(slot["end"])
        assert end - start == timedelta(hours=1)
