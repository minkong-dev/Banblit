"""멤버 추방 endpoint(API의 요청 주소 단위)입니다. 추방은 계정 삭제와 같습니다(사용자 결정 2026-09-14).

탈퇴(DELETE /me)와 같은 삭제 규칙을 따르므로 글·댓글·예약도 함께 삭제되고, 포지션은 비워집니다.
"""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import PERMISSIONS, Member, PermissionSet, Team, TeamSlot
from conftest import AccountFactory, seat


def test_expel_requires_the_member_expel_permission(
    api_client: TestClient, account: AccountFactory
) -> None:
    account("헤드", "head@example.com")
    target_id, _ = account("대상", "target@example.com")
    _, plain = account("일반", "plain@example.com")

    response = api_client.delete(f"/members/{target_id}", cookies=plain)

    assert response.status_code == 403


def test_expelling_deletes_the_account_and_frees_their_slot(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")
    target_id, target = account("대상", "target@example.com")
    team = Team(name="청산")
    db_session.add(team)
    db_session.flush()
    seat(db_session, team.id, target_id)
    db_session.commit()

    response = api_client.delete(f"/members/{target_id}", cookies=head)

    assert response.status_code == 204
    assert db_session.get(Member, target_id) is None
    slot = db_session.scalars(select(TeamSlot).where(TeamSlot.team_id == team.id)).one()
    assert slot.member_id is None
    assert api_client.get("/me", cookies=target).status_code == 401


def test_nobody_can_expel_themselves(
    api_client: TestClient, account: AccountFactory
) -> None:
    """자기 계정은 탈퇴(DELETE /me)로만 삭제합니다. 추방으로 마지막 헤드매니저가 사라지는 것을 막습니다."""
    head_id, head = account("헤드", "head@example.com")

    response = api_client.delete(f"/members/{head_id}", cookies=head)

    assert response.status_code == 422


def test_expelling_an_unknown_member_is_rejected(
    api_client: TestClient, account: AccountFactory
) -> None:
    _, head = account("헤드", "head@example.com")

    assert api_client.delete("/members/999999", cookies=head).status_code == 422


def _grant_expel_only(
    api_client: TestClient, head: dict[str, str], member_id: int
) -> None:
    """member_id 에게 member_expel 만 담은 permission set 을 부여합니다."""
    made = api_client.post(
        "/permission-sets",
        json={
            "name": "추방담당",
            "description": "추방만 수행하는 권한",
            "permissions": ["member_expel"],
        },
        cookies=head,
    )
    assert made.status_code == 201, made.text
    set_id = made.json()["permission_set"]["id"]
    granted = api_client.post(
        f"/members/{member_id}/permission-sets/{set_id}", cookies=head
    )
    assert granted.status_code == 201, granted.text


def test_expelling_the_last_full_set_holder_is_rejected(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """모든 항목을 가진 permission set 의 보유자가 1명뿐이면 그 사람을 추방할 수 없습니다.

    추방은 계정 삭제라 permission set 자체는 남지만 가진 사람이 0명이 됩니다. 그러면 권한을
    부여할 사람이 사라지고 되돌릴 방법이 없습니다.
    """
    head_id, head = account("헤드", "head@example.com")
    attacker_id, attacker = account("추방담당", "expel@example.com")
    _grant_expel_only(api_client, head, attacker_id)

    response = api_client.delete(f"/members/{head_id}", cookies=attacker)

    assert response.status_code == 422
    assert db_session.get(Member, head_id) is not None


def test_expelling_a_full_set_holder_is_allowed_while_another_remains(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    """보유자가 2명이면 1명은 추방됩니다. 검사 기준은 사람 수이지 permission set 수가 아닙니다."""
    head_id, head = account("헤드", "head@example.com")
    second_id, _ = account("부헤드", "second@example.com")
    full_set_id = db_session.scalars(
        select(PermissionSet.id).where(
            PermissionSet.permissions.contains(list(PERMISSIONS))
        )
    ).one()
    granted = api_client.post(
        f"/members/{second_id}/permission-sets/{full_set_id}", cookies=head
    )
    assert granted.status_code == 201, granted.text

    response = api_client.delete(f"/members/{second_id}", cookies=head)

    assert response.status_code == 204
    assert db_session.get(Member, head_id) is not None
