from httpx import Response
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import PERMISSIONS, LoginSession, Member, Post

SIGNUP_BODY = {
    "department": "실용음악과",
    "student_no": "20260001",
    "name": "박서연",
    "email": "seoyeon@example.com",
    "login_id": "seoyeon1",
    "password": "Password123!",
    "cohort": 46,
}

SESSION_COOKIE = "banblit_session"
SIGNED_IN_COOKIE = "banblit_signed_in"


def _signup(api_client: TestClient, **overrides: object) -> dict:
    body = {**SIGNUP_BODY, **overrides}
    return api_client.post("/signup", json=body).json()


def _set_cookie_headers(response: httpx.Response) -> list[str]:
    # httpx.Headers는 같은 이름(set-cookie)이 여러 번 와도 하나로 합쳐지므로, raw 목록을
    # 직접 확인해야 cookie 두 개(banblit_session·banblit_signed_in)를 각각 볼 수 있습니다.
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


def test_the_first_account_is_a_plain_member_without_the_code(
    api_client: TestClient,
) -> None:
    """계정이 0개인 DB 의 첫 가입자도 코드가 없으면 일반 멤버입니다(사용자 결정 2026-09-16).

    예전에는 첫 가입자가 자동으로 헤드매니저였습니다. 배포 직후 개발자보다 먼저 가입한 사람이
    모든 권한을 받는 경로라 없앴습니다.
    """
    response = api_client.post("/signup", json=SIGNUP_BODY)

    assert response.json()["account"]["role"] == "member"


def test_the_admin_code_makes_a_head_manager(
    api_client: TestClient, admin_code: str
) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "admin_code": admin_code})

    assert response.json()["account"]["role"] == "head_manager"


def test_a_later_account_becomes_a_member(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post(
        "/signup",
        json={
            **SIGNUP_BODY,
            "email": "second@example.com",
            "login_id": "second1",
            "student_no": "20260002",
        },
    )

    assert response.json()["account"]["role"] == "member"


def test_signup_allows_a_duplicate_name(api_client: TestClient) -> None:
    """이름이 같아도 학번이 다르면 다른 사람입니다. 동명이인이 있기 때문입니다."""
    _signup(api_client)

    response = api_client.post(
        "/signup",
        json={
            **SIGNUP_BODY,
            "email": "second@example.com",
            "login_id": "second1",
            "student_no": "20260002",
        },
    )

    assert response.status_code == 201


def test_signup_refuses_the_same_person_twice(api_client: TestClient) -> None:
    """이름·학과·학번·기수가 모두 같으면 같은 사람입니다(사용자 결정)."""
    _signup(api_client)

    # 이메일·아이디만 다르고 나머지 4개 값이 같습니다.
    response = api_client.post(
        "/signup", json={**SIGNUP_BODY, "email": "second@example.com", "login_id": "second1"}
    )

    assert response.status_code == 422
    assert "이미" in response.json()["detail"]


def test_signup_rejects_a_duplicate_email(api_client: TestClient) -> None:
    _signup(api_client)

    # 아이디는 다르게 주어 이메일 충돌만 검증합니다. 이름·학과·학번·기수가 같아 사람 조합
    # 제약도 함께 걸리지만, 이메일 오류 문구가 먼저 나오는 것은 기존부터의 동작입니다.
    response = api_client.post(
        "/signup", json={**SIGNUP_BODY, "login_id": "seoyeon2"}
    )

    assert response.status_code == 422
    assert "이메일" in response.json()["detail"]


def test_signup_rejects_a_malformed_email(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "email": "not-an-email"})

    assert response.status_code == 422


def test_signup_rejects_a_short_password(api_client: TestClient) -> None:
    response = api_client.post("/signup", json={**SIGNUP_BODY, "password": "short"})

    assert response.status_code == 422


def test_signup_rejects_a_cohort_out_of_range(api_client: TestClient) -> None:
    """기수는 숫자만 받되 오타로 입력된 큰 수는 거부합니다."""
    response = api_client.post("/signup", json={**SIGNUP_BODY, "cohort": 101})

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
        "/login", json={"login_id": SIGNUP_BODY["login_id"], "password": SIGNUP_BODY["password"]}
    )

    assert response.status_code == 200
    assert "token" not in response.json()
    assert response.cookies.get(SESSION_COOKIE) not in (None, "")


def test_login_rejects_an_unknown_email_without_revealing_that(
    api_client: TestClient,
) -> None:
    unknown = api_client.post(
        "/login", json={"login_id": "unknown1", "password": "whatever1"}
    )

    assert unknown.status_code == 401
    unknown_detail = unknown.json()["detail"]

    _signup(api_client)
    wrong_password = api_client.post(
        "/login", json={"login_id": SIGNUP_BODY["login_id"], "password": "Wrong-Password1"}
    )

    assert wrong_password.status_code == 401
    assert wrong_password.json()["detail"] == unknown_detail


def test_me_returns_the_signed_in_account(api_client: TestClient) -> None:
    # TestClient(테스트용 API 클라이언트)가 cookie 를 저장하므로, signup 응답의 Set-Cookie 가 다음 요청에
    # 자동으로 포함됩니다. 브라우저가 cookie 를 처리하는 방식과 같습니다.
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
        "/login", json={"login_id": SIGNUP_BODY["login_id"], "password": SIGNUP_BODY["password"]}
    )

    assert _session_count(db_session, member_id) == 1


def test_login_removes_only_the_dead_rows_of_that_account(
    api_client: TestClient, db_session: Session
) -> None:
    """만료된 행은 삭제하되 다른 계정의 행은 삭제하지 않아야 합니다. 삭제 조건에
    계정 번호가 빠지면 다른 사용자의 로그인이 해제됩니다."""
    first = _signup(api_client)
    first_id = first["account"]["id"]
    api_client.post("/logout")

    second = _signup(
        api_client, email="second@example.com", login_id="second1", student_no="20260002"
    )
    second_id = second["account"]["id"]
    _session_row(db_session, second_id).expires_at = datetime.now() - timedelta(seconds=1)
    db_session.commit()

    api_client.post(
        "/login", json={"login_id": SIGNUP_BODY["login_id"], "password": SIGNUP_BODY["password"]}
    )

    assert _session_count(db_session, first_id) == 1
    assert _session_count(db_session, second_id) == 1


# ── 로그인 상태 유지 ───────────────────────────────────────────────────────


def _session_max_age(response: Response) -> int:
    """Set-Cookie 에 담긴 Max-Age 를 추출합니다. 없으면 None 을 반환하며, cookie 는 브라우저를 닫을 때까지 유지됩니다."""
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
    """로그인 상태 유지를 끄면 브라우저를 닫을 때 로그인이 해제됩니다. cookie 에 Max-Age 를 설정하지 않습니다."""
    _signup(api_client)

    response = api_client.post(
        "/login",
        json={"login_id": SIGNUP_BODY["login_id"], "password": SIGNUP_BODY["password"]},
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
            "login_id": SIGNUP_BODY["login_id"],
            "password": SIGNUP_BODY["password"],
            "keep": True,
        },
    )

    assert response.status_code == 200
    assert _session_max_age(response) >= 30 * 24 * 60 * 60


def test_keeping_the_login_also_stretches_the_row_on_the_server(
    api_client: TestClient, db_session: Session
) -> None:
    """cookie 의 유효 기간만 늘리면 서버 쪽 session 행이 먼저 만료되어 로그인이 해제됩니다. 둘을 함께 늘려야 합니다."""
    _signup(api_client)
    api_client.post(
        "/login",
        json={
            "login_id": SIGNUP_BODY["login_id"],
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
    """탈퇴하면 그 사람이 작성한 글·댓글·예약도 함께 삭제됩니다(사용자 결정).

    글·댓글·예약을 남겨 두면 작성자가 없는 글이 되고, 작성자 이름 자리에 무엇을 표시할지를
    또 정해야 합니다. 전부 삭제하는 쪽을 선택했습니다.
    """
    _signup(api_client)
    me = api_client.get("/me").json()["account"]
    api_client.post("/notices", json={"title": "공지", "body": "본문"})

    response = api_client.delete("/me")

    assert response.status_code == 204
    assert db_session.get(Member, me["id"]) is None
    assert db_session.scalars(select(Post)).all() == []
    # cookie 도 함께 삭제되어 즉시 로그아웃됩니다.
    assert api_client.get("/me").status_code == 401


# ── 내 정보 수정 ───────────────────────────────────────────────────────────


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


def test_editing_my_profile_into_someone_else_says_who_it_collides_with(
    api_client: TestClient,
) -> None:
    # 학과·학번·기수가 같은 두 사람은 이름만 다릅니다. 이름을 같게 수정하면 가입 때와 같은 문구가 나와야 합니다.
    _signup(api_client)
    _signup(api_client, name="김민준", email="minjun@example.com", login_id="minjun1")

    response = api_client.patch("/me", json={"name": SIGNUP_BODY["name"], "cohort": 46})

    # 가입(test_signup_refuses_the_same_person_twice)과 같은 상태 코드입니다.
    assert response.status_code == 422
    assert "이미 가입된 사람입니다" in response.json()["detail"]


def test_editing_my_profile_rejects_an_empty_name(api_client: TestClient) -> None:
    _signup(api_client)

    assert api_client.patch("/me", json={"name": "  ", "cohort": 47}).status_code == 422


# ── 비밀번호 변경 ──────────────────────────────────────────────────────────


def test_changing_my_password_needs_the_current_one(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post(
        "/me/password", json={"current": "틀린비밀번호1", "next": "Newpass12345!"}
    )

    assert response.status_code == 401


def test_changing_my_password_lets_me_log_in_with_the_new_one(
    api_client: TestClient,
) -> None:
    _signup(api_client)

    changed = api_client.post(
        "/me/password",
        json={"current": SIGNUP_BODY["password"], "next": "Newpass12345!"},
    )

    assert changed.status_code == 204, changed.text
    api_client.post("/logout")
    again = api_client.post(
        "/login", json={"login_id": SIGNUP_BODY["login_id"], "password": "Newpass12345!"}
    )
    assert again.status_code == 200


def test_changing_my_password_rejects_a_weak_one(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post(
        "/me/password", json={"current": SIGNUP_BODY["password"], "next": "짧다"}
    )

    assert response.status_code == 422


def test_signup_rejects_a_student_no_that_is_not_eight_digits(api_client: TestClient) -> None:
    """학번은 숫자 8자리입니다. 화면(validate.ts)과 서버가 같은 규칙을 사용합니다."""
    for bad in ("2026001", "202600011", "2026000a", " ", "２０２６０００１"):
        response = api_client.post("/signup", json={**SIGNUP_BODY, "student_no": bad})

        assert response.status_code == 422, bad
        assert "학번" in response.json()["detail"]


# ── 관리자코드 ─────────────────────────────────────────────────────────────


def _signup_with(api_client: TestClient, **extra: object) -> Response:
    """SIGNUP_BODY 에 항목을 더해 가입을 요청합니다. 이메일이 겹치지 않게 호출마다 바꿉니다."""
    body = {**SIGNUP_BODY, **extra}
    return api_client.post("/signup", json=body)


def test_the_admin_code_grants_every_permission(
    api_client: TestClient, admin_code: str
) -> None:
    """관리자코드를 넣고 가입하면 권한 20개를 전부 받습니다(사용자 결정 2026-09-16).

    코드는 환경변수 ADMIN_SIGNUP_CODE 가 정합니다. 개발자가 정하고 저장소에 넣지 않습니다.
    """
    response = _signup_with(api_client, admin_code=admin_code)

    assert response.status_code == 201, response.text
    body = api_client.get("/me").json()["account"]
    assert set(body["permissions"]) == set(PERMISSIONS)


def test_signing_up_without_the_code_gets_no_permission(api_client: TestClient) -> None:
    """코드가 없으면 첫 가입자여도 권한이 0개입니다.

    예전에는 계정이 0개인 DB 의 첫 가입자가 자동으로 전부 받았습니다. 그 규칙을 없앴습니다 —
    배포 직후 개발자보다 먼저 가입한 사람이 모든 권한을 받는 경로였습니다.
    """
    response = _signup_with(api_client)

    assert response.status_code == 201, response.text
    assert api_client.get("/me").json()["account"]["permissions"] == []


def test_a_wrong_admin_code_signs_up_as_a_plain_member(
    api_client: TestClient, admin_code: str
) -> None:
    """틀린 코드로 가입을 거절하지 않습니다(사용자 결정 2026-09-16). 권한 0개로 가입합니다."""
    response = _signup_with(api_client, admin_code=f"{admin_code}-틀림")

    assert response.status_code == 201, response.text
    assert api_client.get("/me").json()["account"]["permissions"] == []


def test_the_code_is_refused_when_the_environment_has_none(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """환경변수가 비어 있으면 관리자 가입 경로가 닫힙니다. 빈 코드를 맞다고 보면 누구나 통과합니다."""
    monkeypatch.delenv("ADMIN_SIGNUP_CODE", raising=False)

    assert _signup_with(api_client, admin_code="아무값").status_code == 201
    assert api_client.get("/me").json()["account"]["permissions"] == []


# ── 로그인 아이디 ──────────────────────────────────────────────────────────


def test_signup_rejects_an_invalid_login_id(api_client: TestClient) -> None:
    # 20자를 넘는 값은 Pydantic 의 Field(max_length=20)가 먼저 거절하므로 여기서 확인하지 않습니다.
    # "Seoyeon1"처럼 대문자만 섞인 값은 정규화(strip+lower) 후 규칙을 통과하므로 유효한 값입니다.
    for bad in ("ab", "seoyeon!", " "):
        response = api_client.post("/signup", json={**SIGNUP_BODY, "login_id": bad})

        assert response.status_code == 422, bad
        assert "아이디" in response.json()["detail"]


def test_signup_rejects_a_duplicate_login_id(api_client: TestClient) -> None:
    _signup(api_client)

    # 이메일은 다르게 주어 아이디 충돌만 검증합니다.
    response = api_client.post(
        "/signup", json={**SIGNUP_BODY, "email": "second@example.com", "student_no": "20260002"}
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "이미 사용 중인 아이디입니다"


def test_login_works_with_the_login_id_and_normalizes_uppercase_input(
    api_client: TestClient,
) -> None:
    _signup(api_client)

    response = api_client.post(
        "/login",
        json={
            "login_id": SIGNUP_BODY["login_id"].upper(),
            "password": SIGNUP_BODY["password"],
        },
    )

    assert response.status_code == 200, response.text


def test_login_with_the_email_instead_of_the_login_id_fails(api_client: TestClient) -> None:
    _signup(api_client)

    response = api_client.post(
        "/login", json={"login_id": SIGNUP_BODY["email"], "password": SIGNUP_BODY["password"]}
    )

    assert response.status_code == 401
