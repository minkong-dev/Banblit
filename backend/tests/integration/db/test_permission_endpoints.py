from fastapi.testclient import TestClient

from backend.db.models import PERMISSIONS
from conftest import AccountFactory


def _make_set(
    api_client: TestClient, cookies: dict[str, str], name: str, permissions: list[str]
) -> int:
    response = api_client.post(
        "/permission-sets",
        json={"name": name, "description": f"{name} 용 권한", "permissions": permissions},
        cookies=cookies,
    )
    assert response.status_code == 201, response.text
    set_id: int = response.json()["permission_set"]["id"]
    return set_id


def _my_permissions(api_client: TestClient, cookies: dict[str, str]) -> list[str]:
    body = api_client.get("/me", cookies=cookies).json()["account"]
    permissions: list[str] = body["permissions"]
    return permissions


def test_the_first_account_gets_every_permission(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")

    body = api_client.get("/me", cookies=head).json()["account"]

    assert set(body["permissions"]) == set(PERMISSIONS)
    assert body["role"] == "head_manager"


def test_a_later_account_gets_no_permission(
    api_client: TestClient, account: AccountFactory
) -> None:
    account("헤드", "head@example.com")
    _, other = account("멤버", "member@example.com")

    body = api_client.get("/me", cookies=other).json()["account"]

    assert body["permissions"] == []
    assert body["role"] == "member"


def test_two_sets_give_their_union(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")
    member_id, member = account("멤버", "member@example.com")
    rooms_set = _make_set(api_client, head, "방담당", ["room_create"])
    periods_set = _make_set(api_client, head, "기간담당", ["period_create"])

    for set_id in (rooms_set, periods_set):
        granted = api_client.post(
            f"/members/{member_id}/permission-sets/{set_id}", cookies=head
        )
        assert granted.status_code == 201, granted.text

    assert set(_my_permissions(api_client, member)) == {"room_create", "period_create"}
    # 합집합으로 얻은 권한이 응답 목록에만 있는 것이 아니라 실제 요청에서 통과하는지 확인합니다.
    made_room = api_client.post(
        "/rooms",
        json={"name": "합주실A", "opens_at": "09:00", "closes_at": "22:00"},
        cookies=member,
    )
    made_period = api_client.post(
        "/periods",
        json={
            "kind": "open",
            "starts_on": "2026-10-01",
            "ends_on": "2026-10-31",
            "everyday": False,
            "first_run_at": "10:00",
            "second_run_at": "18:00",
        },
        cookies=member,
    )
    assert made_room.status_code == 201, made_room.text
    assert made_period.status_code == 201, made_period.text


def test_a_missing_permission_closes_the_gate(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")
    member_id, member = account("멤버", "member@example.com")
    rooms_set = _make_set(api_client, head, "방담당", ["room_edit"])
    api_client.post(f"/members/{member_id}/permission-sets/{rooms_set}", cookies=head)

    blocked = api_client.post(
        "/periods",
        json={
            "kind": "open",
            "starts_on": "2026-10-01",
            "ends_on": "2026-10-31",
            "everyday": False,
            "first_run_at": "10:00",
            "second_run_at": "18:00",
        },
        cookies=member,
    )

    assert blocked.status_code == 403


def test_revoking_a_set_takes_its_permissions_back(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")
    member_id, member = account("멤버", "member@example.com")
    rooms_set = _make_set(api_client, head, "방담당", ["room_edit"])
    api_client.post(f"/members/{member_id}/permission-sets/{rooms_set}", cookies=head)

    removed = api_client.delete(
        f"/members/{member_id}/permission-sets/{rooms_set}", cookies=head
    )

    assert removed.status_code == 204
    assert _my_permissions(api_client, member) == []


def test_permission_grant_holder_changes_their_own_set(
    api_client: TestClient, account: AccountFactory
) -> None:
    """permission_grant 권한을 가진 사용자는 자신의 permission set(권한 집합)도 축소할 수 있습니다. 다른 사용자에게 권한을 부여하고 자신은 그 역할에서 물러나는 방법입니다.

    모든 항목을 가진 permission set 이 다른 하나 더 있어야 축소가 허용됩니다(마지막 1개 보호 규칙)."""
    head_id, head = account("헤드", "head@example.com")
    own = api_client.get("/permission-sets", cookies=head).json()["permission_sets"][0]
    _make_set(api_client, head, "운영진", list(PERMISSIONS))

    changed = api_client.patch(
        f"/permission-sets/{own['id']}",
        json={"name": own["name"], "description": own["description"], "permissions": ["permission_grant"]},
        cookies=head,
    )

    assert changed.status_code == 200, changed.text
    assert _my_permissions(api_client, head) == ["permission_grant"]
    holders = changed.json()["permission_set"]["members"]
    assert head_id in [one["id"] for one in holders]


def test_permission_grant_holder_drops_their_own_set(
    api_client: TestClient, account: AccountFactory
) -> None:
    head_id, head = account("헤드", "head@example.com")
    own = api_client.get("/permission-sets", cookies=head).json()["permission_sets"][0]

    dropped = api_client.delete(
        f"/members/{head_id}/permission-sets/{own['id']}", cookies=head
    )

    assert dropped.status_code == 204
    assert _my_permissions(api_client, head) == []


def test_without_permission_grant_nobody_touches_permissions(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")
    member_id, member = account("멤버", "member@example.com")
    existing = api_client.get("/permission-sets", cookies=head).json()["permission_sets"][0]
    set_id = existing["id"]

    attempts = [
        api_client.get("/permission-sets", cookies=member),
        api_client.post(
            "/permission-sets",
            json={"name": "내가만든것", "permissions": list(PERMISSIONS)},
            cookies=member,
        ),
        api_client.patch(
            f"/permission-sets/{set_id}",
            json={"name": "고친것", "permissions": list(PERMISSIONS)},
            cookies=member,
        ),
        api_client.delete(f"/permission-sets/{set_id}", cookies=member),
        api_client.post(f"/members/{member_id}/permission-sets/{set_id}", cookies=member),
        api_client.delete(f"/members/{member_id}/permission-sets/{set_id}", cookies=member),
    ]

    assert [attempt.status_code for attempt in attempts] == [403] * 6


def test_deleting_a_set_takes_its_permissions_back(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")
    member_id, member = account("멤버", "member@example.com")
    rooms_set = _make_set(api_client, head, "방담당", ["room_edit"])
    api_client.post(f"/members/{member_id}/permission-sets/{rooms_set}", cookies=head)

    deleted = api_client.delete(f"/permission-sets/{rooms_set}", cookies=head)

    assert deleted.status_code == 204
    assert _my_permissions(api_client, member) == []


def test_a_duplicate_set_name_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")
    _make_set(api_client, head, "방담당", ["room_edit"])

    again = api_client.post(
        "/permission-sets",
        json={"name": "방담당", "permissions": ["period_edit"]},
        cookies=head,
    )

    assert again.status_code == 422


def test_an_unknown_permission_is_refused(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")

    response = api_client.post(
        "/permission-sets",
        json={"name": "이상한것", "permissions": ["everything"]},
        cookies=head,
    )

    assert response.status_code == 422


def test_the_listing_shows_who_holds_each_set(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")
    member_id, _ = account("멤버", "member@example.com")
    rooms_set = _make_set(api_client, head, "방담당", ["room_edit"])
    api_client.post(f"/members/{member_id}/permission-sets/{rooms_set}", cookies=head)

    listed = api_client.get("/permission-sets", cookies=head).json()["permission_sets"]

    holders = {row["id"]: row["members"] for row in listed}
    assert holders[rooms_set] == [{"id": member_id, "name": "멤버"}]


def _set_ids(api_client: TestClient, cookies: dict[str, str]) -> dict[str, int]:
    body = api_client.get("/permission-sets", cookies=cookies).json()
    return {row["name"]: row["id"] for row in body["permission_sets"]}


def test_the_last_full_set_cannot_be_deleted(
    api_client: TestClient, account: AccountFactory
) -> None:
    """모든 항목이 활성화된 permission set 이 1개뿐이면 삭제를 거부합니다(사용자 결정 2026-09-11)."""
    _, head = account("헤드", "head@example.com")
    full_id = _set_ids(api_client, head)["헤드매니저"]

    response = api_client.delete(f"/permission-sets/{full_id}", cookies=head)

    assert response.status_code == 422
    assert _my_permissions(api_client, head) == list(PERMISSIONS)


def test_the_last_full_set_cannot_lose_an_item(
    api_client: TestClient, account: AccountFactory
) -> None:
    """모든 항목이 활성화된 permission set 이 1개뿐이면 항목 비활성화를 거부합니다. 이름·설명 수정은 허용합니다."""
    _, head = account("헤드", "head@example.com")
    full_id = _set_ids(api_client, head)["헤드매니저"]

    fewer = api_client.patch(
        f"/permission-sets/{full_id}",
        json={"name": "헤드매니저", "description": "모든 권한", "permissions": list(PERMISSIONS)[:-1]},
        cookies=head,
    )
    renamed = api_client.patch(
        f"/permission-sets/{full_id}",
        json={"name": "운영진", "description": "모든 권한", "permissions": list(PERMISSIONS)},
        cookies=head,
    )

    assert fewer.status_code == 422
    assert renamed.status_code == 200
    assert renamed.json()["permission_set"]["name"] == "운영진"


def test_a_second_full_set_frees_the_first(
    api_client: TestClient, account: AccountFactory
) -> None:
    """기준은 개인이 아니라 permission set 입니다. 모든 항목을 가진 permission set 이 2개면 하나는 삭제할 수 있습니다."""
    _, head = account("헤드", "head@example.com")
    full_id = _set_ids(api_client, head)["헤드매니저"]
    _make_set(api_client, head, "운영진", list(PERMISSIONS))

    response = api_client.delete(f"/permission-sets/{full_id}", cookies=head)

    assert response.status_code == 204


def test_me_lists_the_names_of_my_permission_sets(
    api_client: TestClient, account: AccountFactory
) -> None:
    """화면은 "헤드매니저" 고정 문구 대신 가진 permission set 의 이름을 표시합니다(사용자 결정 2026-09-11)."""
    _, head = account("헤드", "head@example.com")
    member_id, member = account("멤버", "member@example.com")
    rooms_set = _make_set(api_client, head, "방담당", ["room_edit"])
    api_client.post(f"/members/{member_id}/permission-sets/{rooms_set}", cookies=head)

    head_names = api_client.get("/me", cookies=head).json()["account"]["permission_sets"]
    member_names = api_client.get("/me", cookies=member).json()["account"]["permission_sets"]

    assert head_names == ["헤드매니저"]
    assert member_names == ["방담당"]
