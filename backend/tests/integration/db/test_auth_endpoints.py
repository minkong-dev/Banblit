from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import LoginSession, Member

SIGNUP_BODY = {
    "name": "박서연",
    "email": "seoyeon@example.com",
    "password": "password123",
    "positions": ["보컬"],
}

SESSION_COOKIE = "banblit_session"
SIGNED_IN_COOKIE = "banblit_signed_in"


def _signup(api_client: TestClient, **overrides: object) -> dict:
    body = {**SIGNUP_BODY, **overrides}
    return api_client.post("/signup", json=body).json()


def _set_cookie_headers(response: object) -> list[str]:
    # httpx.Headers는 같은 이름(set-cookie)이 여러 번 와도 하나로 합치므로, raw 목록을
    # 직접 훑어야 쿠키 두 개(banblit_session·banblit_signed_in)를 각각 볼 수 있다.
    return [
        value.decode() for name, value in response.headers.raw if name.decode().lower() == "set-cookie"
    ]


def _session_row(db_session: Session, member_id: int) -> LoginSession:
    row = db_session.scalar(
        select(LoginSession).where(LoginSession.member_id == member_id)
    )
    assert row is not None
    return row


def test_signup_creates_an_account_and_does_not_return_a_token(
    api_client: TestClient,
) -> None:
    response = api_client.post("/signup", json=SIGNUP_BODY)

    assert response.status_code == 201
    body = response.json()
    account = body["account"]
    assert account["name"] == "박서연"
    assert account["email"] == "seoyeon@example.com"
    assert account["positions"] == ["보컬"]
    assert "token" not in body


def test_signup_sets_an_httponly_session_cookie_and_a_readable_signed_in_cookie(
    api_client: TestClient,
) -> None:
    response = api_client.post("/signup", json=SIGNUP_BODY)

    assert response.cookies.get(SESSION_COOKIE) not in (None, "")
    assert response.cookies.get(SIGNED_IN_COOKIE) == "1"

    headers = _set_cookie_headers(response)
    session_header = next(h for h in headers if h.startswith(f"{SESSION_COOKIE}="))
    signed_in_header = next(h for h in headers if h.startswith(f"{SIGNED_IN_COOKIE}="))
    assert "HttpOnly" in session_header
    assert "HttpOnly" not in signed_in_header


def test_the_first_account_becomes_head_manager(api_client: TestClient) -> None:
    response = api_client.post("/signup", json=SIGNUP_BODY)

    assert response.json()["account"]["role"] == "head_manager"


def test_a_later_account_becomes_a_member(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post(
        "/signup", json={**SIGNUP_BODY, "email": "second@example.com"}
    )

    assert response.json()["account"]["role"] == "member"


def test_signup_allows_a_duplicate_name(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post(
        "/signup", json={**SIGNUP_BODY, "email": "second@example.com"}
    )

    assert response.status_code == 201


def test_signup_rejects_a_duplicate_email(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post("/signup", json=SIGNUP_BODY)

    assert response.status_code == 422
    assert "이메일" in response.json()["detail"]


def test_signup_rejects_a_malformed_email(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "email": "not-an-email"})

    assert response.status_code == 422


def test_signup_rejects_a_short_password(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "password": "short"})

    assert response.status_code == 422


def test_signup_rejects_an_unknown_position(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "positions": ["없는포지션"]})

    assert response.status_code == 422


def test_signup_rejects_an_empty_position_list(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "positions": []})

    assert response.status_code == 422


def test_signup_stores_a_hashed_password_not_the_original(
    api_client: TestClient, db_session: Session
) -> None:
    api_client.post("/signup", json=SIGNUP_BODY)

    stored = db_session.scalar(
        select(Member.password_hash).where(Member.email == SIGNUP_BODY["email"])
    )
    assert stored is not None
    assert stored != SIGNUP_BODY["password"]


def test_login_sets_a_session_cookie_and_does_not_return_a_token(
    api_client: TestClient,
) -> None:
    _signup(api_client)

    response = api_client.post(
        "/login", json={"email": SIGNUP_BODY["email"], "password": SIGNUP_BODY["password"]}
    )

    assert response.status_code == 200
    assert "token" not in response.json()
    assert response.cookies.get(SESSION_COOKIE) not in (None, "")


def test_login_rejects_an_unknown_email_without_revealing_that(
    api_client: TestClient,
) -> None:
    unknown = api_client.post(
        "/login", json={"email": "nobody@example.com", "password": "whatever1"}
    )

    assert unknown.status_code == 401
    unknown_detail = unknown.json()["detail"]

    _signup(api_client)
    wrong_password = api_client.post(
        "/login", json={"email": SIGNUP_BODY["email"], "password": "wrong-password"}
    )

    assert wrong_password.status_code == 401
    assert wrong_password.json()["detail"] == unknown_detail


def test_me_returns_the_signed_in_account(api_client: TestClient) -> None:
    # TestClient가 쿠키 저장소를 들고 있어, signup 응답의 Set-Cookie가 다음 요청에
    # 자동으로 실린다 — 화면이 브라우저 쿠키로 하는 것과 같다.
    _signup(api_client)

    response = api_client.get("/me")

    assert response.status_code == 200
    assert response.json()["account"]["email"] == SIGNUP_BODY["email"]


def test_me_rejects_a_missing_session_cookie(api_client: TestClient) -> None:
    response = api_client.get("/me")

    assert response.status_code == 401


def test_me_rejects_an_unknown_session_cookie(api_client: TestClient) -> None:
    api_client.cookies.set(SESSION_COOKIE, "garbage-token")

    response = api_client.get("/me")

    assert response.status_code == 401


def test_me_rejects_a_revoked_session(
    api_client: TestClient, db_session: Session
) -> None:
    body = _signup(api_client)
    row = _session_row(db_session, body["account"]["id"])
    row.revoked_at = datetime.now()
    db_session.commit()

    response = api_client.get("/me")

    assert response.status_code == 401


def test_me_rejects_an_expired_session(
    api_client: TestClient, db_session: Session
) -> None:
    body = _signup(api_client)
    row = _session_row(db_session, body["account"]["id"])
    row.expires_at = datetime.now() - timedelta(seconds=1)
    db_session.commit()

    response = api_client.get("/me")

    assert response.status_code == 401


def test_logout_revokes_the_session_so_it_no_longer_works(
    api_client: TestClient,
) -> None:
    _signup(api_client)

    logout_response = api_client.post("/logout")
    assert logout_response.status_code == 200

    response = api_client.get("/me")
    assert response.status_code == 401


def test_logout_clears_both_cookies(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post("/logout")

    headers = _set_cookie_headers(response)
    session_header = next(h for h in headers if h.startswith(f"{SESSION_COOKIE}="))
    signed_in_header = next(h for h in headers if h.startswith(f"{SIGNED_IN_COOKIE}="))
    assert "Max-Age=0" in session_header
    assert "Max-Age=0" in signed_in_header


def test_logout_succeeds_even_when_not_signed_in(api_client: TestClient) -> None:
    response = api_client.post("/logout")

    assert response.status_code == 200
