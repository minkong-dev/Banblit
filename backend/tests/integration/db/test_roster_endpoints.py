import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session

from backend.api.roster_service import commit_roster
from backend.db.models import Member, Team, TeamSlot

# account 픽스처(tests/conftest.py)를 부른 순서가 곧 역할이다 — 첫 호출이 헤드매니저,
# 그 뒤는 일반멤버다. 일반멤버 계정이 필요한 검사는 헤드매니저를 먼저 만들어야 한다.
from conftest import AccountFactory, seat


def _team(session: Session, name: str, slots: int = 0) -> Team:
    """팀 하나와 빈 보컬 자리 slots 개를 만든다."""
    team = Team(name=name)
    session.add(team)
    session.flush()
    for ordinal in range(1, slots + 1):
        session.add(
            TeamSlot(team_id=team.id, instrument="보컬", ordinal=ordinal)
        )
    session.flush()
    return team


def _member(session: Session, name: str, cohort: int | None = None) -> Member:
    """로그인과 무관한, 명단에만 있는 사람 — 순수 SQLAlchemy 객체로 넣는다."""
    member = Member(name=name, cohort=cohort)
    session.add(member)
    session.flush()
    return member


def _slot_ids(api_client: TestClient, cookies: dict[str, str], team_id: int) -> list[int]:
    body = api_client.get(f"/teams/{team_id}/slots", cookies=cookies).json()
    return [slot["id"] for slot in body["slots"]]


# ── 팀 목록 ────────────────────────────────────────────────────────────────


def test_teams_list_requires_authentication(api_client: TestClient) -> None:
    assert api_client.get("/teams").status_code == 401


def test_teams_list_is_empty_when_no_teams(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, cookies = account("박서연", "head@example.com")

    body = api_client.get("/teams", cookies=cookies).json()

    assert body["teams"] == []


def test_teams_carry_both_slot_count_and_filled_count(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """자리 수와 앉은 수를 함께 준다 — 하나만 주면 몇 자리 비었는지 화면이 모른다."""
    _, cookies = account("박서연", "head@example.com")
    team = _team(db_session, "청산", slots=3)
    seat(db_session, team.id, _member(db_session, "황찬우").id, instrument="일렉")
    db_session.commit()

    teams = api_client.get("/teams", cookies=cookies).json()["teams"]

    assert teams[0]["slot_count"] == 4
    assert teams[0]["filled_count"] == 1


# ── 자리 목록 ──────────────────────────────────────────────────────────────


def test_team_slots_read_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "청산", slots=1)
    db_session.commit()

    assert api_client.get(f"/teams/{team.id}/slots").status_code == 401


def test_empty_slots_are_listed_too(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """빈 자리를 빼면 화면이 채워야 할 곳을 보여줄 수 없다."""
    _, cookies = account("박서연", "head@example.com")
    team = _team(db_session, "청산", slots=1)
    seat(db_session, team.id, _member(db_session, "황찬우", cohort=44).id)
    db_session.commit()

    slots = api_client.get(f"/teams/{team.id}/slots", cookies=cookies).json()["slots"]

    assert len(slots) == 2
    filled = [slot for slot in slots if slot["member_id"] is not None]
    assert len(filled) == 1
    assert filled[0]["member_name"] == "황찬우"
    assert filled[0]["member_cohort"] == 44


def test_team_slots_endpoint_rejects_an_unknown_team(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, cookies = account("박서연", "head@example.com")

    assert api_client.get("/teams/9999/slots", cookies=cookies).status_code == 422


def test_team_members_lists_only_seated_people(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, cookies = account("박서연", "head@example.com")
    team = _team(db_session, "청산", slots=2)
    seat(db_session, team.id, _member(db_session, "황찬우").id, instrument="일렉")
    db_session.commit()

    members = api_client.get(f"/teams/{team.id}/members", cookies=cookies).json()

    assert [member["name"] for member in members["members"]] == ["황찬우"]


# ── 사람 검색(돋보기) ──────────────────────────────────────────────────────


def test_member_search_requires_authentication(api_client: TestClient) -> None:
    assert api_client.get("/members/search?q=박").status_code == 401


def test_member_search_returns_nothing_for_an_empty_query(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """빈 검색어에 전체를 주면 명단을 통째로 내주는 통로가 된다."""
    _, cookies = account("박서연", "head@example.com")
    _member(db_session, "황찬우")
    db_session.commit()

    body = api_client.get("/members/search?q=", cookies=cookies).json()

    assert body["members"] == []


def test_member_search_finds_by_partial_name_with_cohort(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """동명이인은 기수로 가른다 — 검색 결과에 기수가 함께 실려야 고를 수 있다."""
    _, cookies = account("박서연", "head@example.com")
    _member(db_session, "박민경", cohort=47)
    _member(db_session, "박민경", cohort=49)
    _member(db_session, "황찬우", cohort=44)
    db_session.commit()

    members = api_client.get("/members/search?q=박민경", cookies=cookies).json()["members"]

    assert sorted(member["cohort"] for member in members) == [47, 49]


# ── 팀 만들기 ──────────────────────────────────────────────────────────────


def test_team_creation_requires_authentication(api_client: TestClient) -> None:
    response = api_client.post("/teams", json={"name": "청산", "slots": {"보컬": 1}})

    assert response.status_code == 401


def test_team_creation_rejects_a_plain_member(
    api_client: TestClient, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, plain = account("이도현", "member@example.com")

    response = api_client.post(
        "/teams", json={"name": "청산", "slots": {"보컬": 1}}, cookies=plain
    )

    assert response.status_code == 403


def test_team_is_created_with_its_instrument_slots(
    api_client: TestClient, account: AccountFactory
) -> None:
    """팀과 자리가 한 번에 들어간다 — 자리 없는 팀이 잠깐이라도 저장되면 안 된다."""
    _, head = account("박서연", "head@example.com")

    created = api_client.post(
        "/teams",
        json={"name": "불꽃놀이", "slots": {"일렉": 2, "드럼": 1, "보컬": 0}},
        cookies=head,
    )

    assert created.status_code == 201
    team_id = created.json()["team"]["id"]
    slots = api_client.get(f"/teams/{team_id}/slots", cookies=head).json()["slots"]
    assert sorted((slot["instrument"], slot["ordinal"]) for slot in slots) == [
        ("드럼", 1),
        ("일렉", 1),
        ("일렉", 2),
    ]
    assert all(slot["member_id"] is None for slot in slots)


def test_team_creation_rejects_an_unknown_instrument(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/teams", json={"name": "청산", "slots": {"하프": 1}}, cookies=head
    )

    assert response.status_code == 422


def test_team_creation_rejects_zero_slots(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/teams", json={"name": "청산", "slots": {"보컬": 0}}, cookies=head
    )

    assert response.status_code == 422


def test_team_creation_rejects_more_slots_than_the_engine_takes(
    api_client: TestClient, account: AccountFactory
) -> None:
    """배정 계산이 팀당 10명까지만 받는다 — 그보다 많은 자리는 만들어도 못 쓴다."""
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/teams", json={"name": "청산", "slots": {"보컬": 11}}, cookies=head
    )

    assert response.status_code == 422


def test_team_creation_rejects_a_duplicate_name(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _team(db_session, "청산")
    db_session.commit()

    response = api_client.post(
        "/teams", json={"name": "청산", "slots": {"보컬": 1}}, cookies=head
    )

    assert response.status_code == 422


def test_team_creation_trims_surrounding_whitespace(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    body = api_client.post(
        "/teams", json={"name": "  청산  ", "slots": {"보컬": 1}}, cookies=head
    ).json()

    assert body["team"]["name"] == "청산"


def test_team_creation_rejects_a_whitespace_only_name(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.post(
        "/teams", json={"name": "   ", "slots": {"보컬": 1}}, cookies=head
    )

    assert response.status_code == 422


def test_team_name_race_at_commit_time_is_translated_not_500(
    test_engine: Engine, db_session: Session
) -> None:
    """사전 검사와 commit 사이에는 잠금이 없다 — 나중 커밋이 제약에 걸린다."""
    db_session.add(Team(name="청산"))
    db_session.commit()

    with Session(test_engine) as other:
        other.add(Team(name="청산"))
        with pytest.raises(ValueError, match="이미 있는 팀 이름입니다"):
            commit_roster(other)


# ── 팀 이름 고치기 ─────────────────────────────────────────────────────────


def test_team_patch_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "청산")
    db_session.commit()

    assert api_client.patch(f"/teams/{team.id}", json={"name": "곰팡이"}).status_code == 401


def test_team_patch_rejects_a_plain_member(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, plain = account("이도현", "member@example.com")
    team = _team(db_session, "청산")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}", json={"name": "곰팡이"}, cookies=plain
    )

    assert response.status_code == 403


def test_team_name_is_patched(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "청산", slots=2)
    db_session.commit()

    body = api_client.patch(
        f"/teams/{team.id}", json={"name": "곰팡이"}, cookies=head
    ).json()

    assert body["team"]["name"] == "곰팡이"
    assert body["team"]["slot_count"] == 2


def test_team_patch_rejects_a_name_already_used_by_another_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    _team(db_session, "청산")
    other = _team(db_session, "곰팡이")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{other.id}", json={"name": "청산"}, cookies=head
    )

    assert response.status_code == 422


def test_team_patch_keeping_its_own_name_is_not_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "청산")
    db_session.commit()

    response = api_client.patch(
        f"/teams/{team.id}", json={"name": "청산"}, cookies=head
    )

    assert response.status_code == 200


def test_team_patch_of_unknown_id_is_rejected(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")

    response = api_client.patch("/teams/9999", json={"name": "청산"}, cookies=head)

    assert response.status_code == 422


# ── 자리에 사람 앉히기 ─────────────────────────────────────────────────────


def test_seating_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "청산", slots=1)
    slot = db_session.scalars(select(TeamSlot)).one()
    db_session.commit()

    response = api_client.put(
        f"/teams/{team.id}/slots/{slot.id}", json={"member_id": 1}
    )

    assert response.status_code == 401


def test_seating_rejects_a_plain_member(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    other_id, plain = account("이도현", "member@example.com")
    team = _team(db_session, "청산", slots=1)
    db_session.commit()
    slot_id = _slot_ids(api_client, plain, team.id)[0]

    response = api_client.put(
        f"/teams/{team.id}/slots/{slot_id}",
        json={"member_id": other_id},
        cookies=plain,
    )

    assert response.status_code == 403


def test_a_member_is_seated(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "청산", slots=1)
    member = _member(db_session, "황찬우", cohort=44)
    db_session.commit()
    slot_id = _slot_ids(api_client, head, team.id)[0]

    body = api_client.put(
        f"/teams/{team.id}/slots/{slot_id}",
        json={"member_id": member.id},
        cookies=head,
    ).json()

    assert body["slot"]["member_name"] == "황찬우"
    assert body["slot"]["member_cohort"] == 44


def test_seating_replaces_whoever_sat_there(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "청산", slots=1)
    first = _member(db_session, "황찬우")
    second = _member(db_session, "유지후")
    db_session.commit()
    slot_id = _slot_ids(api_client, head, team.id)[0]
    api_client.put(
        f"/teams/{team.id}/slots/{slot_id}", json={"member_id": first.id}, cookies=head
    )

    body = api_client.put(
        f"/teams/{team.id}/slots/{slot_id}",
        json={"member_id": second.id},
        cookies=head,
    ).json()

    assert body["slot"]["member_name"] == "유지후"


def test_seating_rejects_someone_already_in_another_slot_of_the_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """한 사람이 같은 팀의 두 자리를 겸하면 배정이 그 사람을 같은 시간에 두 번 센다."""
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "청산", slots=2)
    member = _member(db_session, "황찬우")
    db_session.commit()
    first_id, second_id = _slot_ids(api_client, head, team.id)
    api_client.put(
        f"/teams/{team.id}/slots/{first_id}",
        json={"member_id": member.id},
        cookies=head,
    )

    response = api_client.put(
        f"/teams/{team.id}/slots/{second_id}",
        json={"member_id": member.id},
        cookies=head,
    )

    assert response.status_code == 422


def test_seating_rejects_an_unknown_member(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "청산", slots=1)
    db_session.commit()
    slot_id = _slot_ids(api_client, head, team.id)[0]

    response = api_client.put(
        f"/teams/{team.id}/slots/{slot_id}", json={"member_id": 9999}, cookies=head
    )

    assert response.status_code == 422


def test_seating_rejects_a_slot_from_another_team(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """자리 번호만 맞고 팀이 다르면 없는 것으로 본다."""
    _, head = account("박서연", "head@example.com")
    mine = _team(db_session, "청산", slots=1)
    other = _team(db_session, "곰팡이", slots=1)
    member = _member(db_session, "황찬우")
    db_session.commit()
    other_slot_id = _slot_ids(api_client, head, other.id)[0]

    response = api_client.put(
        f"/teams/{mine.id}/slots/{other_slot_id}",
        json={"member_id": member.id},
        cookies=head,
    )

    assert response.status_code == 422


# ── 자리 비우기 ────────────────────────────────────────────────────────────


def test_clearing_a_slot_requires_authentication(
    api_client: TestClient, db_session: Session
) -> None:
    team = _team(db_session, "청산", slots=1)
    slot = db_session.scalars(select(TeamSlot)).one()
    db_session.commit()

    assert api_client.delete(f"/teams/{team.id}/slots/{slot.id}").status_code == 401


def test_a_member_can_leave_their_own_slot_without_any_permission(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """스스로 빠지는 것은 항목이 없어도 된다."""
    account("박서연", "head@example.com")
    plain_id, plain = account("이도현", "member@example.com")
    team = _team(db_session, "청산")
    seat(db_session, team.id, plain_id)
    db_session.commit()
    slot_id = _slot_ids(api_client, plain, team.id)[0]

    response = api_client.delete(f"/teams/{team.id}/slots/{slot_id}", cookies=plain)

    assert response.status_code == 204


def test_a_plain_member_cannot_clear_someone_elses_slot(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    account("박서연", "head@example.com")
    _, plain = account("이도현", "member@example.com")
    team = _team(db_session, "청산")
    seat(db_session, team.id, _member(db_session, "황찬우").id)
    db_session.commit()
    slot_id = _slot_ids(api_client, plain, team.id)[0]

    response = api_client.delete(f"/teams/{team.id}/slots/{slot_id}", cookies=plain)

    assert response.status_code == 403


def test_clearing_keeps_the_slot_itself(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """팀 구성이 바뀐 것이 아니라 사람만 빠진 것이다."""
    _, head = account("박서연", "head@example.com")
    team = _team(db_session, "청산")
    seat(db_session, team.id, _member(db_session, "황찬우").id)
    db_session.commit()
    slot_id = _slot_ids(api_client, head, team.id)[0]

    api_client.delete(f"/teams/{team.id}/slots/{slot_id}", cookies=head)

    slots = api_client.get(f"/teams/{team.id}/slots", cookies=head).json()["slots"]
    assert len(slots) == 1
    assert slots[0]["member_id"] is None
