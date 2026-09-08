from datetime import datetime, timedelta

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import LoginSession, Member, Post

SIGNUP_BODY = {
    "department": "실용음악과",
    "student_no": "20260001",
    "name": "박서연",
    "email": "seoyeon@example.com",
    "password": "password123",
    "cohort": 46,
}

SESSION_COOKIE = "banblit_session"
SIGNED_IN_COOKIE = "banblit_signed_in"


def _signup(api_client: TestClient, **overrides: object) -> dict:
    body = {**SIGNUP_BODY, **overrides}
    return api_client.post("/signup", json=body).json()


def _set_cookie_headers(response: httpx.Response) -> list[str]:
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
    assert account["cohort"] == 46
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
        "/signup", json={**SIGNUP_BODY, "email": "second@example.com", "student_no": "second"}
    )

    assert response.json()["account"]["role"] == "member"


def test_signup_allows_a_duplicate_name(api_client: TestClient) -> None:
    """이름이 같아도 학번이 다르면 다른 사람이다 — 동명이인은 흔하다."""
    _signup(api_client)

    response = api_client.post(
        "/signup",
        json={**SIGNUP_BODY, "email": "second@example.com", "student_no": "20260002"},
    )

    assert response.status_code == 201


def test_signup_refuses_the_same_person_twice(api_client: TestClient) -> None:
    """이름·학과·학번·기수가 모두 같으면 같은 사람이다(사용자 결정)."""
    _signup(api_client)

    # 이메일만 다르고 나머지 네 값이 같다.
    response = api_client.post(
        "/signup", json={**SIGNUP_BODY, "email": "second@example.com"}
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_signup_rejects_a_duplicate_email(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post("/signup", json=SIGNUP_BODY)

    assert response.status_code == 422
    assert "이메일" in response.json()["detail"]


def test_signup_rejects_a_malformed_email(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "email": "not-an-email", "student_no": "not-an-email"})

    assert response.status_code == 422


def test_signup_rejects_a_short_password(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "password": "short"})

    assert response.status_code == 422


def test_signup_rejects_a_cohort_out_of_range(api_client: TestClient) -> None:
    """기수는 숫자만 받되 오타로 들어온 큰 수는 막는다."""
    response = api_client.post("/signup", json={**SIGNUP_BODY, "cohort": 9999})

    assert response.status_code == 422


def test_signup_rejects_a_cohort_below_one(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "cohort": 0})

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


def _session_count(db_session: Session, member_id: int) -> int:
    return len(
        db_session.scalars(
            select(LoginSession).where(LoginSession.member_id == member_id)
        ).all()
    )


def test_login_removes_that_accounts_expired_session_row(
    api_client: TestClient, db_session: Session
) -> None:
    body = _signup(api_client)
    member_id = body["account"]["id"]
    _session_row(db_session, member_id).expires_at = datetime.now() - timedelta(seconds=1)
    db_session.commit()

    api_client.post(
        "/login", json={"email": SIGNUP_BODY["email"], "password": SIGNUP_BODY["password"]}
    )

    assert _session_count(db_session, member_id) == 1


def test_login_removes_only_the_dead_rows_of_that_account(
    api_client: TestClient, db_session: Session
) -> None:
    """끊긴 행은 지우되 남의 계정 행은 건드리지 않아야 한다 — 지우는 조건에
    계정 번호가 빠지면 다른 사람이 로그인 상태를 잃는다."""
    first = _signup(api_client)
    first_id = first["account"]["id"]
    api_client.post("/logout")

    second = _signup(api_client, email="second@example.com", student_no="second")
    second_id = second["account"]["id"]
    _session_row(db_session, second_id).expires_at = datetime.now() - timedelta(seconds=1)
    db_session.commit()

    api_client.post(
        "/login", json={"email": SIGNUP_BODY["email"], "password": SIGNUP_BODY["password"]}
    )

    assert _session_count(db_session, first_id) == 1
    assert _session_count(db_session, second_id) == 1


# ── 로그인 상태 유지 ───────────────────────────────────────────────────────


def _session_max_age(response) -> int:
    """Set-Cookie 에 실린 Max-Age 를 꺼낸다. 없으면 브라우저 닫을 때까지다."""
    for raw in response.headers.get_list("set-cookie"):
        if raw.startswith(f"{SESSION_COOKIE}="):
            for part in raw.split(";"):
                key, _, value = part.strip().partition("=")
                if key.lower() == "max-age":
                    return int(value)
            return 0
    raise AssertionError(f"세션 쿠키가 없습니다: {response.headers}")


def test_login_without_keep_lasts_only_for_the_browser_session(
    api_client: TestClient, db_session: Session
) -> None:
    """체크를 끄면 브라우저를 닫을 때 로그인이 풀린다 — 쿠키에 수명을 싣지 않는다."""
    _signup(api_client)

    response = api_client.post(
        "/login",
        json={"email": SIGNUP_BODY["email"], "password": SIGNUP_BODY["password"]},
    )

    assert response.status_code == 200
    assert _session_max_age(response) == 0


def test_login_with_keep_lasts_far_longer(
    api_client: TestClient, db_session: Session
) -> None:
    _signup(api_client)

    response = api_client.post(
        "/login",
        json={
            "email": SIGNUP_BODY["email"],
            "password": SIGNUP_BODY["password"],
            "keep": True,
        },
    )

    assert response.status_code == 200
    assert _session_max_age(response) >= 30 * 24 * 60 * 60


def test_keeping_the_login_also_stretches_the_row_on_the_server(
    api_client: TestClient, db_session: Session
) -> None:
    """쿠키만 늘리면 서버 쪽 행이 먼저 만료돼 로그인이 풀린다. 둘이 함께 늘어야 한다."""
    _signup(api_client)
    api_client.post(
        "/login",
        json={
            "email": SIGNUP_BODY["email"],
            "password": SIGNUP_BODY["password"],
            "keep": True,
        },
    )

    rows = db_session.scalars(select(LoginSession)).all()
    longest = max(row.expires_at - row.created_at for row in rows)
    assert longest >= timedelta(days=30)


# ── 회원 탈퇴 ──────────────────────────────────────────────────────────────


def test_leaving_requires_login(api_client: TestClient) -> None:
    assert api_client.delete("/me").status_code == 401


def test_leaving_removes_the_account_and_everything_it_left(
    api_client: TestClient, db_session: Session
) -> None:
    """탈퇴하면 그 사람이 남긴 것도 함께 사라진다(사용자 결정).

    글·댓글·예약을 남겨 두면 쓴 사람이 없는 글이 되고, 이름 자리에 무엇을 적을지를
    또 정해야 한다. 통째로 지우는 쪽을 골랐다.
    """
    _signup(api_client)
    me = api_client.get("/me").json()["account"]
    api_client.post("/notices", json={"title": "공지", "body": "본문"})

    response = api_client.delete("/me")

    assert response.status_code == 204
    assert db_session.get(Member, me["id"]) is None
    assert db_session.scalars(select(Post)).all() == []
    # 쿠키도 함께 지워져 그 자리에서 로그아웃된다.
    assert api_client.get("/me").status_code == 401


# ── 내 정보 고치기 ─────────────────────────────────────────────────────────


def test_editing_my_profile_requires_login(api_client: TestClient) -> None:
    assert api_client.patch("/me", json={"name": "새 이름", "cohort": 47}).status_code == 401


def test_i_can_change_my_name_and_cohort(
    api_client: TestClient, db_session: Session
) -> None:
    _signup(api_client)

    response = api_client.patch("/me", json={"name": "고친 이름", "cohort": 47})

    assert response.status_code == 200, response.text
    body = response.json()["account"]
    assert body["name"] == "고친 이름"
    assert body["cohort"] == 47


def test_editing_my_profile_rejects_an_empty_name(api_client: TestClient) -> None:
    _signup(api_client)

    assert api_client.patch("/me", json={"name": "  ", "cohort": 47}).status_code == 422


# ── 비밀번호 바꾸기 ────────────────────────────────────────────────────────


def test_changing_my_password_needs_the_current_one(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post(
        "/me/password", json={"current": "틀린비밀번호1", "next": "newpass12345"}
    )

    assert response.status_code == 401


def test_changing_my_password_lets_me_log_in_with_the_new_one(
    api_client: TestClient,
) -> None:
    _signup(api_client)

    changed = api_client.post(
        "/me/password",
        json={"current": SIGNUP_BODY["password"], "next": "newpass12345"},
    )

    assert changed.status_code == 204, changed.text
    api_client.post("/logout")
    again = api_client.post(
        "/login", json={"email": SIGNUP_BODY["email"], "password": "newpass12345"}
    )
    assert again.status_code == 200


def test_changing_my_password_rejects_a_weak_one(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post(
        "/me/password", json={"current": SIGNUP_BODY["password"], "next": "짧다"}
    )

    assert response.status_code == 422
