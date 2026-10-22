from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from datetime import datetime

from sqlalchemy.exc import IntegrityError

from backend.api.routers import auth as auth_router
from backend.db.models import SocialAccount
from backend.services.auth.social_login import SocialError, link
from conftest import AccountFactory

STATE_COOKIE = "banblit_social_state"
SESSION_COOKIE = "banblit_session"


@pytest.fixture(autouse=True)
def google_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ORIGIN", "https://banblit.example")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.delenv("KAKAO_CLIENT_ID", raising=False)


@pytest.fixture()
def provider_answers(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """callback 이 제공자에 묻는 대신 code 를 이 dict 에서 찾아 사용자 번호를 돌려받게 합니다."""
    answers: dict[str, str] = {}

    def fake(config: object, code: str) -> str:
        if code not in answers:
            raise ValueError("소셜 로그인 제공자가 access token 을 반환하지 않았어요")
        return answers[code]

    monkeypatch.setattr(auth_router, "social_user_id", fake)
    return answers


def _start(api_client: TestClient) -> str:
    response = api_client.get("/social/google/start", follow_redirects=False)
    assert response.status_code == 302
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def _callback(api_client: TestClient, code: str, state: str, cookies: dict[str, str]) -> str:
    response = api_client.get(
        f"/social/google/callback?code={code}&state={state}", cookies=cookies, follow_redirects=False
    )
    assert response.status_code == 302
    return response.headers["location"]


def test_only_configured_providers_are_listed(api_client: TestClient) -> None:
    assert api_client.get("/social").json() == {"providers": ["google"]}
    assert api_client.get("/social/kakao/start", follow_redirects=False).status_code == 404


def test_start_redirects_to_google_with_the_state_cookie(api_client: TestClient) -> None:
    response = api_client.get("/social/google/start", follow_redirects=False)

    location = urlparse(response.headers["location"])
    assert location.netloc == "accounts.google.com"
    query = parse_qs(location.query)
    assert query["redirect_uri"] == ["https://banblit.example/api/social/google/callback"]
    assert api_client.cookies.get(STATE_COOKIE) == query["state"][0]


@pytest.mark.parametrize("state", ["someone-elses-state", "한글-state"])
def test_a_state_that_does_not_match_the_cookie_fails(
    api_client: TestClient, provider_answers: dict[str, str], state: str
) -> None:
    provider_answers["code-1"] = "g-1"
    _start(api_client)

    location = _callback(api_client, "code-1", state, {})

    assert location == "/login?social=failed"
    # state cookie 는 1회용이라 결과와 무관하게 삭제됩니다.
    assert api_client.cookies.get(STATE_COOKIE) is None


def test_a_denied_consent_without_a_code_fails(api_client: TestClient) -> None:
    state = _start(api_client)

    response = api_client.get(f"/social/google/callback?error=access_denied&state={state}", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == "/login?social=failed"


def test_a_google_state_is_rejected_by_the_kakao_callback(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch, provider_answers: dict[str, str]
) -> None:
    monkeypatch.setenv("KAKAO_CLIENT_ID", "rest-key")
    provider_answers["code-1"] = "k-1"
    state = _start(api_client)

    response = api_client.get(f"/social/kakao/callback?code=code-1&state={state}", follow_redirects=False)

    assert response.headers["location"] == "/login?social=failed"


def test_a_callback_without_the_state_cookie_fails(api_client: TestClient, provider_answers: dict[str, str]) -> None:
    provider_answers["code-1"] = "g-1"

    assert _callback(api_client, "code-1", "any-state", {}) == "/login?social=failed"


def test_a_signed_in_member_links_and_then_signs_in_with_google(
    api_client: TestClient, account: AccountFactory, db_session: Session, provider_answers: dict[str, str]
) -> None:
    member_id, cookies = account("박서연", "seoyeon@example.com")
    provider_answers["code-link"] = "g-77"
    provider_answers["code-login"] = "g-77"

    state = _start(api_client)
    assert _callback(api_client, "code-link", state, cookies) == "/profile?social=linked"
    assert api_client.get("/me", cookies=cookies).json()["linked_social"] == ["google"]
    row = db_session.scalar(select(SocialAccount).where(SocialAccount.member_id == member_id))
    assert row is not None and row.provider_user_id == "g-77"

    api_client.cookies.clear()
    state = _start(api_client)
    location = _callback(api_client, "code-login", state, {})

    assert location == "/scheduler?social=signed_in"
    assert api_client.cookies.get(SESSION_COOKIE) is not None
    assert api_client.get("/me").json()["account"]["id"] == member_id


def test_an_unlinked_google_account_cannot_sign_in(api_client: TestClient, provider_answers: dict[str, str]) -> None:
    provider_answers["code-1"] = "g-unknown"
    state = _start(api_client)

    location = urlparse(_callback(api_client, "code-1", state, {}))

    assert location.path == "/login"
    query = parse_qs(location.query)
    assert query["social"] == ["failed"]
    assert query["detail"] == ["unlinked"]
    assert api_client.cookies.get(SESSION_COOKIE) is None


def test_a_google_account_links_to_one_member_only(
    api_client: TestClient, account: AccountFactory, provider_answers: dict[str, str]
) -> None:
    _, first = account("박서연", "seoyeon@example.com")
    _, second = account("김민준", "minjun@example.com")
    provider_answers["code-a"] = "g-1"
    provider_answers["code-b"] = "g-1"

    assert _callback(api_client, "code-a", _start(api_client), first) == "/profile?social=linked"
    location = urlparse(_callback(api_client, "code-b", _start(api_client), second))

    assert location.path == "/profile"
    assert parse_qs(location.query)["detail"] == ["taken"]
    assert api_client.get("/me", cookies=second).json()["linked_social"] == []


def test_linking_the_same_provider_twice_is_rejected(
    api_client: TestClient, account: AccountFactory, provider_answers: dict[str, str]
) -> None:
    _, cookies = account("박서연", "seoyeon@example.com")
    provider_answers["code-a"] = "g-1"
    provider_answers["code-b"] = "g-2"
    _callback(api_client, "code-a", _start(api_client), cookies)

    location = urlparse(_callback(api_client, "code-b", _start(api_client), cookies))

    assert parse_qs(location.query)["detail"] == ["already"]
    assert api_client.get("/me", cookies=cookies).json()["linked_social"] == ["google"]


def test_kakao_is_enabled_by_the_client_id_alone(api_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("KAKAO_CLIENT_ID", "rest-key")

    assert api_client.get("/social").json() == {"providers": ["google", "kakao"]}
    response = api_client.get("/social/kakao/start", follow_redirects=False)
    assert urlparse(response.headers["location"]).netloc == "kauth.kakao.com"


def test_unlinking_removes_the_row_and_keeps_password_sign_in(
    api_client: TestClient, account: AccountFactory, provider_answers: dict[str, str]
) -> None:
    _, cookies = account("박서연", "seoyeon@example.com")
    provider_answers["code-1"] = "g-1"
    _callback(api_client, "code-1", _start(api_client), cookies)

    assert api_client.delete("/me/social/google", cookies=cookies).status_code == 204
    assert api_client.get("/me", cookies=cookies).json()["linked_social"] == []
    assert api_client.delete("/me/social/google", cookies=cookies).status_code == 422


def test_a_unique_violation_at_commit_becomes_the_taken_code(
    api_client: TestClient, account: AccountFactory, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 조회와 INSERT 사이에 다른 요청이 같은 연결을 먼저 저장한 경우입니다. commit 이 unique 제약으로 실패합니다.
    member_id, _ = account("박서연", "seoyeon@example.com")
    rolled_back: list[bool] = []
    monkeypatch.setattr(db_session, "commit", lambda: (_ for _ in ()).throw(IntegrityError("INSERT", {}, Exception("unique"))))
    monkeypatch.setattr(db_session, "rollback", lambda: rolled_back.append(True))

    with pytest.raises(SocialError) as caught:
        link(db_session, member_id, "google", "g-race", datetime(2026, 10, 22, 12, 0))

    assert caught.value.code == "taken"
    assert rolled_back == [True]
