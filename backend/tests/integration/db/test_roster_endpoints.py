import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from backend.api.roster_service import commit_roster
from backend.db.models import Member, Membership, Position, Team

# account 픽스처(tests/conftest.py)를 부른 순서가 곧 역할이다 — 첫 호출이 헤드매니저,
# 그 뒤는 일반멤버다. 일반멤버 계정이 필요한 검사는 헤드매니저를 먼저 만들어야 한다.
from conftest import AccountFactory


def _team(session: Session, name: str, join_policy: str = "auto") -> Team:
    team = Team(name=name, join_policy=join_policy)
    session.add(team)
    session.flush()
    return team


def _member(session: Session, name: str) -> Member:
    """로그인과 무관한, 소속만 있는 사람 — 순수 SQLAlchemy 객체로 넣는다."""
    member = Member(name=name)
    session.add(member)
    session.flush()
    return member


def _position_id(session: Session, name: str = "보컬") -> int:
    return session.scalars(select(Position.id).where(Position.name == name)).one()


def _join(
    session: Session,
    member_id: int,
    team: Team,
    position_name: str,
    status: str = "approved",
) -> None:
    session.add(
        Membership(
            member_id=member_id,
            team_id=team.id,
            position_id=_position_id(session, position_name),
            status=status,
        )
    )
    session.flush()


def test_teams_list_requires_authentication(api_client: TestClient) -> None:
    response = api_client.get("/teams")

    assert response.status_code == 401


def test_teams_list_is_empty_when_no_teams(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.get("/teams", cookies=head)

    assert response.status_code == 200
    assert response.json()["teams"] == []


def test_teams_are_listed_in_id_order_with_member_counts(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    reader_id, reader = account("박서연", "head@example.com")
    second = _team(db_session, "파랑주의보")
    first = _team(db_session, "새벽 네시")
    _join(db_session, reader_id, first, "보컬")
    db_session.commit()

    response = api_client.get("/teams", cookies=reader)

    assert response.status_code == 200
    teams = response.json()["teams"]
    assert [t["id"] for t in teams] == sorted([second.id, first.id])
    by_id = {t["id"]: t for t in teams}
    assert by_id[first.id]["member_count"] == 1
    assert by_id[second.id]["member_count"] == 0


def test_team_members_read_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.get(f"/teams/{team.id}/members")

    assert response.status_code == 401


def test_team_members_are_listed_with_positions(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, reader = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    second = _member(db_session, "이도현")
    first = _member(db_session, "정하윤")
    _join(db_session, second.id, team, "기타")
    _join(db_session, first.id, team, "보컬")
    db_session.commit()

    response = api_client.get(f"/teams/{team.id}/members", cookies=reader)

    assert response.status_code == 200
    members = response.json()["members"]
    assert [m["id"] for m in members] == sorted([second.id, first.id])
    by_id = {m["id"]: m for m in members}
    assert by_id[first.id]["positions"] == ["보컬"]
    assert by_id[second.id]["positions"] == ["기타"]


def test_team_members_list_is_empty_for_a_team_with_no_members(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, reader = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.get(f"/teams/{team.id}/members", cookies=reader)

    assert response.status_code == 200
    assert response.json()["members"] == []


def test_team_members_endpoint_rejects_an_unknown_team(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, reader = account("박서연", "head@example.com")

    response = api_client.get("/teams/999999/members", cookies=reader)

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_positions_read_requires_authentication(api_client: TestClient) -> None:
    response = api_client.get("/positions")

    assert response.status_code == 401


def test_positions_are_listed_in_id_order(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, reader = account("박서연", "head@example.com")

    response = api_client.get("/positions", cookies=reader)

    assert response.status_code == 200
    positions = response.json()["positions"]
    ids = [p["id"] for p in positions]
    assert ids == sorted(ids)
    names = {p["name"] for p in positions}
    assert {"보컬", "기타", "베이스", "드럼", "키보드"} <= names


def test_team_creation_requires_authentication(api_client: TestClient) -> None:
    response = api_client.post("/teams", json={"name": "새 팀"})

    assert response.status_code == 401


def test_team_creation_rejects_a_plain_member(
    api_client: TestClient, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, plain = account("김민수", "m@example.com")

    response = api_client.post("/teams", json={"name": "새 팀"}, cookies=plain)

    assert response.status_code == 403


def test_team_is_created_with_a_name(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post("/teams", json={"name": "새 팀"}, cookies=head)

    assert response.status_code == 201
    team = response.json()["team"]
    assert team["name"] == "새 팀"
    assert team["member_count"] == 0
    assert isinstance(team["id"], int)


def test_team_creation_rejects_a_duplicate_name(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.post("/teams", json={"name": "새벽 네시"}, cookies=head)

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_team_creation_rejects_a_whitespace_only_name(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post("/teams", json={"name": "   "}, cookies=head)

    assert response.status_code == 422
    assert "팀 이름" in response.json()["detail"]


def test_team_creation_trims_surrounding_whitespace_from_the_name(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post("/teams", json={"name": "  파랑주의보  "}, cookies=head)

    assert response.status_code == 201
    assert response.json()["team"]["name"] == "파랑주의보"


def test_team_name_race_at_commit_time_is_translated_not_500(
    test_engine: Engine, db_session: Session
) -> None:
    """room_service.test_room_name_race_at_commit_time_is_translated_not_500 과 같은
    얼개다. 이름 중복 사전 검사와 commit 사이의 경합에서 실제로 나는 예외를 흉내낸다."""
    session_a = Session(test_engine)
    session_b = Session(test_engine)
    try:
        session_a.add(Team(name="경합팀"))
        commit_roster(session_a)

        session_b.add(Team(name="경합팀"))
        with pytest.raises(ValueError, match="이미 있는 팀 이름입니다"):
            commit_roster(session_b)
    finally:
        session_a.close()
        session_b.close()


def test_team_patch_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.patch(f"/teams/{team.id}", json={"name": "새벽 다섯시"})

    assert response.status_code == 401


def test_team_patch_rejects_a_plain_member(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, plain = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}", json={"name": "새벽 다섯시"}, cookies=plain
    )

    assert response.status_code == 403


def test_team_name_is_patched(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}", json={"name": "새벽 다섯시"}, cookies=head
    )

    assert response.status_code == 200
    assert response.json()["team"]["name"] == "새벽 다섯시"


def test_team_patch_reflects_the_current_member_count(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    member = _member(db_session, "이도현")
    _join(db_session, member.id, team, "기타")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}", json={"name": "새벽 다섯시"}, cookies=head
    )

    assert response.status_code == 200
    assert response.json()["team"]["member_count"] == 1


def test_team_patch_rejects_a_name_already_used_by_another_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _team(db_session, "새벽 네시")
    other = _team(db_session, "파랑주의보")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{other.id}", json={"name": "새벽 네시"}, cookies=head
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_team_patch_keeping_its_own_name_is_not_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}", json={"name": "새벽 네시"}, cookies=head
    )

    assert response.status_code == 200


def test_team_patch_of_unknown_id_is_rejected(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.patch("/teams/999999", json={"name": "없는팀"}, cookies=head)

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_join_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    db_session.commit()
    position_id = _position_id(db_session, "보컬")

    response = api_client.post(
        f"/teams/{team.id}/members", json={"position_id": position_id}
    )

    assert response.status_code == 401


def test_member_joins_a_team_with_a_position(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    joiner_id, joiner = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()
    position_id = _position_id(db_session, "보컬")

    response = api_client.post(
        f"/teams/{team.id}/members", json={"position_id": position_id}, cookies=joiner
    )

    assert response.status_code == 201
    membership = response.json()["membership"]
    assert membership["member_id"] == joiner_id
    assert membership["member_name"] == "박서연"
    assert membership["team_id"] == team.id
    assert membership["position"] == "보컬"


def test_join_puts_in_the_cookie_owner_even_if_another_id_is_sent(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """남을 대신 넣는 길은 없다 — 본문에 남의 번호를 실어도 쿠키의 주인이 들어간다."""
    head_id, _ = account("박서연", "head@example.com")
    joiner_id, joiner = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()
    position_id = _position_id(db_session, "보컬")

    response = api_client.post(
        f"/teams/{team.id}/members",
        json={"member_id": head_id, "position_id": position_id},
        cookies=joiner,
    )

    assert response.status_code == 201
    assert response.json()["membership"]["member_id"] == joiner_id


def test_join_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, joiner = account("박서연", "head@example.com")
    position_id = _position_id(db_session, "보컬")

    response = api_client.post(
        "/teams/999999/members", json={"position_id": position_id}, cookies=joiner
    )

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_join_rejects_an_unknown_position(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, joiner = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.post(
        f"/teams/{team.id}/members", json={"position_id": 999999}, cookies=joiner
    )

    assert response.status_code == 422
    assert "포지션" in response.json()["detail"]


def test_join_rejects_a_member_already_in_the_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    joiner_id, joiner = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    _join(db_session, joiner_id, team, "보컬")
    db_session.commit()
    position_id = _position_id(db_session, "기타")

    response = api_client.post(
        f"/teams/{team.id}/members", json={"position_id": position_id}, cookies=joiner
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_leave_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    member = _member(db_session, "박서연")
    _join(db_session, member.id, team, "보컬")
    db_session.commit()

    response = api_client.delete(f"/teams/{team.id}/members/{member.id}")

    assert response.status_code == 401


def test_member_leaves_a_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    leaver_id, leaver = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    _join(db_session, leaver_id, team, "보컬")
    db_session.commit()

    response = api_client.delete(
        f"/teams/{team.id}/members/{leaver_id}", cookies=leaver
    )

    assert response.status_code == 204
    remaining = db_session.execute(
        select(Membership).where(
            Membership.team_id == team.id, Membership.member_id == leaver_id
        )
    ).first()
    assert remaining is None


def test_head_manager_removes_someone_elses_membership(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    target = _member(db_session, "이도현")
    _join(db_session, target.id, team, "기타")
    db_session.commit()

    response = api_client.delete(
        f"/teams/{team.id}/members/{target.id}", cookies=head
    )

    assert response.status_code == 204


def test_plain_member_cannot_remove_someone_elses_membership(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    actor_id, actor = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시")
    target = _member(db_session, "이도현")
    _join(db_session, actor_id, team, "보컬")
    _join(db_session, target.id, team, "기타")
    db_session.commit()

    response = api_client.delete(
        f"/teams/{team.id}/members/{target.id}", cookies=actor
    )

    assert response.status_code == 403
    remaining = db_session.execute(
        select(Membership).where(
            Membership.team_id == team.id, Membership.member_id == target.id
        )
    ).first()
    assert remaining is not None


def test_leave_rejects_a_member_not_in_the_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    leaver_id, leaver = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.delete(
        f"/teams/{team.id}/members/{leaver_id}", cookies=leaver
    )

    assert response.status_code == 422
    assert "소속이 아닙니다" in response.json()["detail"]


def test_leave_rejects_an_unknown_team(
    api_client: TestClient, account: AccountFactory
) -> None:
    leaver_id, leaver = account("박서연", "head@example.com")

    response = api_client.delete(f"/teams/999999/members/{leaver_id}", cookies=leaver)

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_joining_an_auto_team_is_immediate(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    joiner_id, joiner = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시", join_policy="auto")
    db_session.commit()
    position_id = _position_id(db_session, "보컬")

    response = api_client.post(
        f"/teams/{team.id}/members", json={"position_id": position_id}, cookies=joiner
    )

    assert response.status_code == 201
    assert response.json()["membership"]["status"] == "approved"
    listed = api_client.get(f"/teams/{team.id}/members", cookies=joiner)
    assert [m["id"] for m in listed.json()["members"]] == [joiner_id]


def test_joining_an_approval_team_only_files_a_request(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    joiner_id, joiner = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    db_session.commit()
    position_id = _position_id(db_session, "기타")

    response = api_client.post(
        f"/teams/{team.id}/members", json={"position_id": position_id}, cookies=joiner
    )

    assert response.status_code == 201
    assert response.json()["membership"]["status"] == "pending"
    listed = api_client.get(f"/teams/{team.id}/members", cookies=joiner)
    assert listed.json()["members"] == []
    requests = api_client.get(f"/teams/{team.id}/join-requests", cookies=head)
    assert requests.status_code == 200
    assert requests.json()["join_requests"] == [
        {"member_id": joiner_id, "member_name": "김민수", "position": "기타"}
    ]


def test_pending_people_are_not_counted_in_the_member_count(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    waiting = _member(db_session, "이도현")
    joined = _member(db_session, "정하윤")
    _join(db_session, waiting.id, team, "기타", status="pending")
    _join(db_session, joined.id, team, "보컬")
    db_session.commit()

    response = api_client.get("/teams", cookies=head)

    assert response.status_code == 200
    by_id = {t["id"]: t for t in response.json()["teams"]}
    assert by_id[team.id]["member_count"] == 1


def test_join_requests_list_needs_the_join_approve_permission(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, plain = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    db_session.commit()

    response = api_client.get(f"/teams/{team.id}/join-requests", cookies=plain)

    assert response.status_code == 403


def test_approving_a_request_puts_the_person_on_the_roster(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    waiting = _member(db_session, "이도현")
    _join(db_session, waiting.id, team, "기타", status="pending")
    db_session.commit()

    response = api_client.post(
        f"/teams/{team.id}/join-requests/{waiting.id}/approve", cookies=head
    )

    assert response.status_code == 200
    listed = api_client.get(f"/teams/{team.id}/members", cookies=head)
    assert [m["id"] for m in listed.json()["members"]] == [waiting.id]
    left = api_client.get(f"/teams/{team.id}/join-requests", cookies=head)
    assert left.json()["join_requests"] == []


def test_approving_needs_the_join_approve_permission(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, plain = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    waiting = _member(db_session, "이도현")
    _join(db_session, waiting.id, team, "기타", status="pending")
    db_session.commit()

    response = api_client.post(
        f"/teams/{team.id}/join-requests/{waiting.id}/approve", cookies=plain
    )

    assert response.status_code == 403


def test_rejecting_a_request_removes_it(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    waiting = _member(db_session, "이도현")
    _join(db_session, waiting.id, team, "기타", status="pending")
    db_session.commit()

    response = api_client.delete(
        f"/teams/{team.id}/join-requests/{waiting.id}", cookies=head
    )

    assert response.status_code == 204
    left = api_client.get(f"/teams/{team.id}/join-requests", cookies=head)
    assert left.json()["join_requests"] == []
    remaining = db_session.execute(
        select(Membership).where(
            Membership.team_id == team.id, Membership.member_id == waiting.id
        )
    ).first()
    assert remaining is None


def test_rejecting_needs_the_join_approve_permission(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, plain = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    waiting = _member(db_session, "이도현")
    _join(db_session, waiting.id, team, "기타", status="pending")
    db_session.commit()

    response = api_client.delete(
        f"/teams/{team.id}/join-requests/{waiting.id}", cookies=plain
    )

    assert response.status_code == 403


def test_the_same_person_cannot_file_two_requests(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _, joiner = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    db_session.commit()
    api_client.post(
        f"/teams/{team.id}/members",
        json={"position_id": _position_id(db_session, "보컬")},
        cookies=joiner,
    )

    response = api_client.post(
        f"/teams/{team.id}/members",
        json={"position_id": _position_id(db_session, "기타")},
        cookies=joiner,
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]
    left = api_client.get(f"/teams/{team.id}/join-requests", cookies=head)
    assert len(left.json()["join_requests"]) == 1


def test_an_approved_member_cannot_file_a_request(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    joiner_id, joiner = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    _join(db_session, joiner_id, team, "보컬")
    db_session.commit()

    response = api_client.post(
        f"/teams/{team.id}/members",
        json={"position_id": _position_id(db_session, "기타")},
        cookies=joiner,
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_a_pending_person_cancels_their_own_request(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """신청 취소는 팀에서 빠지는 통로를 그대로 쓴다 — 대기 중인 자기 행을 지운다."""
    waiting_id, waiting = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    _join(db_session, waiting_id, team, "기타", status="pending")
    db_session.commit()

    response = api_client.delete(
        f"/teams/{team.id}/members/{waiting_id}", cookies=waiting
    )

    assert response.status_code == 204
    remaining = db_session.execute(
        select(Membership).where(
            Membership.team_id == team.id, Membership.member_id == waiting_id
        )
    ).first()
    assert remaining is None


def test_the_join_policy_is_switched_through_patch(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _, joiner = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}",
        json={"name": "새벽 네시", "join_policy": "approval"},
        cookies=head,
    )

    assert response.status_code == 200
    joined = api_client.post(
        f"/teams/{team.id}/members",
        json={"position_id": _position_id(db_session, "보컬")},
        cookies=joiner,
    )
    assert joined.json()["membership"]["status"] == "pending"


def test_patch_without_a_join_policy_leaves_it_alone(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _, joiner = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}", json={"name": "파랑주의보"}, cookies=head
    )

    assert response.status_code == 200
    joined = api_client.post(
        f"/teams/{team.id}/members",
        json={"position_id": _position_id(db_session, "보컬")},
        cookies=joiner,
    )
    assert joined.json()["membership"]["status"] == "pending"


def test_patch_rejects_an_unknown_join_policy(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}",
        json={"name": "새벽 네시", "join_policy": "whenever"},
        cookies=head,
    )

    assert response.status_code == 422


def test_team_list_carries_the_join_policy(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, reader = account("박서연", "head@example.com")
    auto = _team(db_session, "새벽 네시")
    approval = _team(db_session, "파랑주의보", join_policy="approval")
    db_session.commit()

    response = api_client.get("/teams", cookies=reader)

    assert response.status_code == 200
    by_id = {t["id"]: t for t in response.json()["teams"]}
    assert by_id[auto.id]["join_policy"] == "auto"
    assert by_id[approval.id]["join_policy"] == "approval"


def test_me_carries_my_memberships_with_their_status(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """새로 고쳐도 자기가 어느 팀에 신청해 뒀는지 알 수 있어야 한다."""
    mine_id, mine = account("박서연", "head@example.com")
    joined = _team(db_session, "새벽 네시")
    waiting = _team(db_session, "파랑주의보", join_policy="approval")
    _join(db_session, mine_id, joined, "보컬")
    _join(db_session, mine_id, waiting, "기타", status="pending")
    db_session.commit()

    response = api_client.get("/me", cookies=mine)

    assert response.status_code == 200
    assert response.json()["memberships"] == [
        {
            "team_id": joined.id,
            "team_name": "새벽 네시",
            "position": "보컬",
            "status": "approved",
        },
        {
            "team_id": waiting.id,
            "team_name": "파랑주의보",
            "position": "기타",
            "status": "pending",
        },
    ]


def test_me_carries_an_empty_list_for_someone_in_no_team(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, mine = account("박서연", "head@example.com")

    response = api_client.get("/me", cookies=mine)

    assert response.status_code == 200
    assert response.json()["memberships"] == []


def test_me_does_not_leak_someone_elses_memberships(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    other_id, _ = account("박서연", "head@example.com")
    _, mine = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시")
    _join(db_session, other_id, team, "보컬")
    db_session.commit()

    response = api_client.get("/me", cookies=mine)

    assert response.json()["memberships"] == []


def test_a_new_join_request_shows_up_on_me(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, joiner = account("김민수", "m@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    db_session.commit()
    api_client.post(
        f"/teams/{team.id}/members",
        json={"position_id": _position_id(db_session, "보컬")},
        cookies=joiner,
    )

    response = api_client.get("/me", cookies=joiner)

    memberships = response.json()["memberships"]
    assert [m["status"] for m in memberships] == ["pending"]
    assert memberships[0]["team_id"] == team.id


def test_rejecting_cannot_remove_an_already_approved_membership(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """승인이 먼저 끝난 신청은 거절 통로가 건드리지 못한다 — 소속이 조용히 사라지면 안 된다."""
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    waiting = _member(db_session, "이도현")
    _join(db_session, waiting.id, team, "기타", status="pending")
    db_session.commit()
    api_client.post(f"/teams/{team.id}/join-requests/{waiting.id}/approve", cookies=head)

    response = api_client.delete(
        f"/teams/{team.id}/join-requests/{waiting.id}", cookies=head
    )

    assert response.status_code == 422
    listed = api_client.get(f"/teams/{team.id}/members", cookies=head)
    assert [m["id"] for m in listed.json()["members"]] == [waiting.id]


def test_approving_twice_is_rejected_the_second_time(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "새벽 네시", join_policy="approval")
    waiting = _member(db_session, "이도현")
    _join(db_session, waiting.id, team, "기타", status="pending")
    db_session.commit()
    api_client.post(f"/teams/{team.id}/join-requests/{waiting.id}/approve", cookies=head)

    response = api_client.post(
        f"/teams/{team.id}/join-requests/{waiting.id}/approve", cookies=head
    )

    assert response.status_code == 422
