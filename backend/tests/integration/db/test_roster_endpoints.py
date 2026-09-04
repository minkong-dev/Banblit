import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from backend.api.roster_service import commit_roster
from backend.db.models import Member, Membership, Position, Team


def _team(session: Session, name: str) -> Team:
    team = Team(name=name)
    session.add(team)
    session.flush()
    return team


def _member(session: Session, name: str) -> Member:
    member = Member(name=name)
    session.add(member)
    session.flush()
    return member


def _position_id(session: Session, name: str = "보컬") -> int:
    return session.scalars(select(Position.id).where(Position.name == name)).one()


def _join(session: Session, member: Member, team: Team, position_name: str) -> None:
    session.add(
        Membership(
            member_id=member.id,
            team_id=team.id,
            position_id=_position_id(session, position_name),
        )
    )
    session.flush()


def test_teams_list_is_empty_when_no_teams(api_client: TestClient) -> None:
    response = api_client.get("/teams")

    assert response.status_code == 200
    assert response.json()["teams"] == []


def test_teams_are_listed_in_id_order_with_member_counts(
    api_client: TestClient, db_session: Session
) -> None:
    second = _team(db_session, "파랑주의보")
    first = _team(db_session, "새벽 네시")
    member = _member(db_session, "박서연")
    _join(db_session, member, first, "보컬")
    db_session.commit()

    response = api_client.get("/teams")

    assert response.status_code == 200
    teams = response.json()["teams"]
    assert [t["id"] for t in teams] == sorted([second.id, first.id])
    by_id = {t["id"]: t for t in teams}
    assert by_id[first.id]["member_count"] == 1
    assert by_id[second.id]["member_count"] == 0


def test_team_members_are_listed_with_positions(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    second = _member(db_session, "이도현")
    first = _member(db_session, "박서연")
    _join(db_session, second, team, "기타")
    _join(db_session, first, team, "보컬")
    db_session.commit()

    response = api_client.get(f"/teams/{team.id}/members")

    assert response.status_code == 200
    members = response.json()["members"]
    assert [m["id"] for m in members] == sorted([second.id, first.id])
    by_id = {m["id"]: m for m in members}
    assert by_id[first.id]["positions"] == ["보컬"]
    assert by_id[second.id]["positions"] == ["기타"]


def test_team_members_list_is_empty_for_a_team_with_no_members(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.get(f"/teams/{team.id}/members")

    assert response.status_code == 200
    assert response.json()["members"] == []


def test_team_members_endpoint_rejects_an_unknown_team(api_client: TestClient) -> None:
    response = api_client.get("/teams/999999/members")

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_positions_are_listed_in_id_order(api_client: TestClient) -> None:
    response = api_client.get("/positions")

    assert response.status_code == 200
    positions = response.json()["positions"]
    ids = [p["id"] for p in positions]
    assert ids == sorted(ids)
    names = {p["name"] for p in positions}
    assert {"보컬", "기타", "베이스", "드럼", "키보드"} <= names


def test_team_is_created_with_a_name(
    api_client: TestClient, db_session: Session
) -> None:
    creator = _member(db_session, "박서연")
    db_session.commit()

    response = api_client.post(
        "/teams", json={"name": "새 팀", "requested_by": creator.id}
    )

    assert response.status_code == 201
    team = response.json()["team"]
    assert team["name"] == "새 팀"
    assert team["member_count"] == 0
    assert isinstance(team["id"], int)


def test_team_creation_rejects_a_duplicate_name(
    api_client: TestClient, db_session: Session
) -> None:
    creator = _member(db_session, "박서연")
    _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.post(
        "/teams", json={"name": "새벽 네시", "requested_by": creator.id}
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_team_creation_rejects_a_whitespace_only_name(
    api_client: TestClient, db_session: Session
) -> None:
    creator = _member(db_session, "박서연")
    db_session.commit()

    response = api_client.post(
        "/teams", json={"name": "   ", "requested_by": creator.id}
    )

    assert response.status_code == 422
    assert "팀 이름" in response.json()["detail"]


def test_team_creation_trims_surrounding_whitespace_from_the_name(
    api_client: TestClient, db_session: Session
) -> None:
    creator = _member(db_session, "박서연")
    db_session.commit()

    response = api_client.post(
        "/teams", json={"name": "  파랑주의보  ", "requested_by": creator.id}
    )

    assert response.status_code == 201
    assert response.json()["team"]["name"] == "파랑주의보"


def test_team_creation_rejects_an_unknown_requester(api_client: TestClient) -> None:
    response = api_client.post(
        "/teams", json={"name": "새 팀", "requested_by": 999999}
    )

    assert response.status_code == 422
    assert "사람" in response.json()["detail"]


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


def test_team_name_is_patched(api_client: TestClient, db_session: Session) -> None:
    requester = _member(db_session, "박서연")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}",
        json={"name": "새벽 다섯시", "requested_by": requester.id},
    )

    assert response.status_code == 200
    assert response.json()["team"]["name"] == "새벽 다섯시"


def test_team_patch_reflects_the_current_member_count(
    api_client: TestClient, db_session: Session
) -> None:
    requester = _member(db_session, "박서연")
    team = _team(db_session, "새벽 네시")
    member = _member(db_session, "이도현")
    _join(db_session, member, team, "기타")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}",
        json={"name": "새벽 다섯시", "requested_by": requester.id},
    )

    assert response.status_code == 200
    assert response.json()["team"]["member_count"] == 1


def test_team_patch_rejects_a_name_already_used_by_another_team(
    api_client: TestClient, db_session: Session
) -> None:
    requester = _member(db_session, "박서연")
    _team(db_session, "새벽 네시")
    other = _team(db_session, "파랑주의보")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{other.id}",
        json={"name": "새벽 네시", "requested_by": requester.id},
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_team_patch_keeping_its_own_name_is_not_rejected(
    api_client: TestClient, db_session: Session
) -> None:
    requester = _member(db_session, "박서연")
    team = _team(db_session, "새벽 네시")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}", json={"name": "새벽 네시", "requested_by": requester.id}
    )

    assert response.status_code == 200


def test_team_patch_of_unknown_id_is_rejected(
    api_client: TestClient, db_session: Session
) -> None:
    requester = _member(db_session, "박서연")
    db_session.commit()

    response = api_client.patch(
        "/teams/999999", json={"name": "없는팀", "requested_by": requester.id}
    )

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_member_joins_a_team_with_a_position(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    member = _member(db_session, "박서연")
    db_session.commit()
    position_id = _position_id(db_session, "보컬")

    response = api_client.post(
        f"/teams/{team.id}/members",
        json={"member_id": member.id, "position_id": position_id},
    )

    assert response.status_code == 201
    membership = response.json()["membership"]
    assert membership["member_id"] == member.id
    assert membership["team_id"] == team.id
    assert membership["position"] == "보컬"


def test_join_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "박서연")
    db_session.commit()
    position_id = _position_id(db_session, "보컬")

    response = api_client.post(
        "/teams/999999/members",
        json={"member_id": member.id, "position_id": position_id},
    )

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]


def test_join_rejects_an_unknown_member(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    db_session.commit()
    position_id = _position_id(db_session, "보컬")

    response = api_client.post(
        f"/teams/{team.id}/members",
        json={"member_id": 999999, "position_id": position_id},
    )

    assert response.status_code == 422
    assert "사람" in response.json()["detail"]


def test_join_rejects_an_unknown_position(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    member = _member(db_session, "박서연")
    db_session.commit()

    response = api_client.post(
        f"/teams/{team.id}/members",
        json={"member_id": member.id, "position_id": 999999},
    )

    assert response.status_code == 422
    assert "포지션" in response.json()["detail"]


def test_join_rejects_a_member_already_in_the_team(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    member = _member(db_session, "박서연")
    _join(db_session, member, team, "보컬")
    db_session.commit()
    position_id = _position_id(db_session, "기타")

    response = api_client.post(
        f"/teams/{team.id}/members",
        json={"member_id": member.id, "position_id": position_id},
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_member_leaves_a_team(api_client: TestClient, db_session: Session) -> None:
    team = _team(db_session, "새벽 네시")
    member = _member(db_session, "박서연")
    _join(db_session, member, team, "보컬")
    db_session.commit()

    response = api_client.delete(f"/teams/{team.id}/members/{member.id}")

    assert response.status_code == 204
    remaining = db_session.execute(
        select(Membership).where(
            Membership.team_id == team.id, Membership.member_id == member.id
        )
    ).first()
    assert remaining is None


def test_leave_rejects_a_member_not_in_the_team(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "새벽 네시")
    member = _member(db_session, "박서연")
    db_session.commit()

    response = api_client.delete(f"/teams/{team.id}/members/{member.id}")

    assert response.status_code == 422
    assert "소속이 아닙니다" in response.json()["detail"]


def test_leave_rejects_an_unknown_team(
    api_client: TestClient, db_session: Session
) -> None:
    member = _member(db_session, "박서연")
    db_session.commit()

    response = api_client.delete(f"/teams/999999/members/{member.id}")

    assert response.status_code == 422
    assert "팀" in response.json()["detail"]
