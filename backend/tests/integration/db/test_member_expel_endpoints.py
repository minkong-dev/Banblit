"""멤버 추방 endpoint(API의 요청 주소 단위)입니다. 추방은 계정 삭제와 같습니다(사용자 결정 2026-09-14).

탈퇴(DELETE /me)와 같은 삭제 규칙을 따르므로 글·댓글·예약도 함께 삭제되고, 포지션은 비워집니다.
"""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Member, Team, TeamSlot
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
