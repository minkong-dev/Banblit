"""api/auth_dependency.py 가 cookie, session, 권한을 판정하는 규칙을 DB 없이 검증합니다. 조회 함수는 가짜로 바꿉니다.
SessionRejected 는 api/app.py 가 401 과 session_rejected code 로 응답합니다(test_auth_endpoints.py)."""

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from backend.api import auth_dependency
from backend.db.models import Member


class _FakeSession:
    def __init__(self, member: Member | None) -> None:
        self._member = member

    def get(self, _model: Any, _key: int) -> Member | None:
        return self._member


def _resolve_to(member_id: int | None) -> Any:
    return lambda *_: None if member_id is None else SimpleNamespace(member_id=member_id)


def test_a_request_without_the_cookie_is_rejected() -> None:
    with pytest.raises(auth_dependency.SessionRejected):
        auth_dependency.require_account(None, _FakeSession(None))  # type: ignore[arg-type]


def test_an_unknown_or_expired_token_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_dependency, "resolve_session", _resolve_to(None))
    with pytest.raises(auth_dependency.SessionRejected):
        auth_dependency.require_account("token", _FakeSession(None))  # type: ignore[arg-type]


def test_a_roster_only_member_without_a_password_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    # 명단에만 있고 가입하지 않은 멤버는 로그인 session 이 있어도 계정으로 인정하지 않습니다.
    monkeypatch.setattr(auth_dependency, "resolve_session", _resolve_to(7))
    with pytest.raises(auth_dependency.SessionRejected):
        auth_dependency.require_account("token", _FakeSession(Member(id=7, name="김민수")))  # type: ignore[arg-type]


def test_a_signed_up_member_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    member = Member(id=7, name="김민수", password_hash="scrypt$...")
    monkeypatch.setattr(auth_dependency, "resolve_session", _resolve_to(7))
    assert auth_dependency.require_account("token", _FakeSession(member)) is member  # type: ignore[arg-type]


def test_a_missing_permission_is_403(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_dependency, "account_permissions", lambda *_: ["room_edit"])
    member = Member(id=7, name="김민수")
    auth_dependency.ensure_permission(_FakeSession(member), member, "room_edit")  # type: ignore[arg-type]
    with pytest.raises(HTTPException) as caught:
        auth_dependency.ensure_permission(_FakeSession(member), member, "room_delete")  # type: ignore[arg-type]
    assert caught.value.status_code == 403
