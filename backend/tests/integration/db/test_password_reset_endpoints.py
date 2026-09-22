import logging
import zlib
from datetime import datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.password_reset import RESEND_INTERVAL, RESET_TTL, issue_reset_token
from backend.db.models import PasswordResetToken
from conftest import AccountFactory

HEAD = ("박서연", "seoyeon@example.com")
OTHER = ("김민수", "minsu@example.com")
NEW_PASSWORD = "Brand-New-Pass9"
UNKNOWN_EMAIL = "nobody@example.com"
# account fixture(conftest.py)가 이메일에서 파생시키는 login_id 와 같은 계산식입니다.
HEAD_LOGIN_ID = f"u{zlib.crc32(HEAD[1].encode()) % 10**8:08d}"


def _confirm(api_client: TestClient, token: str, password: str) -> httpx.Response:
    return api_client.post(
        "/password-reset/confirm", json={"token": token, "password": password}
    )


def test_a_token_changes_the_password_and_the_new_one_logs_in(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    member_id, _ = account(*HEAD)
    token = issue_reset_token(db_session, member_id, datetime.now())
    assert token is not None

    response = _confirm(api_client, token, NEW_PASSWORD)

    assert response.status_code == 200
    logged_in = api_client.post(
        "/login", json={"login_id": HEAD_LOGIN_ID, "password": NEW_PASSWORD}
    )
    assert logged_in.status_code == 200


def test_the_same_token_is_refused_the_second_time(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    member_id, _ = account(*HEAD)
    token = issue_reset_token(db_session, member_id, datetime.now())
    assert token is not None
    assert _confirm(api_client, token, NEW_PASSWORD).status_code == 200

    again = _confirm(api_client, token, "Another-Pass77")

    assert again.status_code == 400
    # 두 번째 요청이 거절되었으므로 첫 번째로 변경한 비밀번호가 그대로 유지됩니다.
    assert (
        api_client.post(
            "/login", json={"login_id": HEAD_LOGIN_ID, "password": NEW_PASSWORD}
        ).status_code
        == 200
    )


def test_an_expired_token_is_refused(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    member_id, _ = account(*HEAD)
    stale = datetime.now() - RESET_TTL - timedelta(seconds=1)
    token = issue_reset_token(db_session, member_id, stale)
    assert token is not None

    response = _confirm(api_client, token, NEW_PASSWORD)

    assert response.status_code == 400


def test_the_row_keeps_a_fingerprint_not_the_token_itself(
    db_session: Session, account: AccountFactory
) -> None:
    member_id, _ = account(*HEAD)
    token = issue_reset_token(db_session, member_id, datetime.now())
    assert token is not None

    stored = db_session.scalars(select(PasswordResetToken.token_hash)).all()

    assert token not in stored


def test_resetting_kills_the_logins_that_were_already_open(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    member_id, cookies = account(*HEAD)
    assert api_client.get("/me", cookies=cookies).status_code == 200
    token = issue_reset_token(db_session, member_id, datetime.now())
    assert token is not None

    assert _confirm(api_client, token, NEW_PASSWORD).status_code == 200

    assert api_client.get("/me", cookies=cookies).status_code == 401


def test_a_request_for_an_unknown_email_answers_like_a_known_one(
    api_client: TestClient, account: AccountFactory
) -> None:
    account(*HEAD)

    known = api_client.post("/password-reset", json={"email": HEAD[1]})
    unknown = api_client.post("/password-reset", json={"email": UNKNOWN_EMAIL})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_a_second_request_within_the_interval_does_not_issue_another_token(
    db_session: Session, account: AccountFactory
) -> None:
    member_id, _ = account(*HEAD)
    now = datetime.now()
    first = issue_reset_token(db_session, member_id, now)

    second = issue_reset_token(db_session, member_id, now + RESEND_INTERVAL / 2)

    assert first is not None
    assert second is None
    assert len(db_session.scalars(select(PasswordResetToken.id)).all()) == 1


def test_a_new_token_kills_the_one_issued_before_it(
    api_client: TestClient, db_session: Session, account: AccountFactory
) -> None:
    member_id, _ = account(*HEAD)
    now = datetime.now()
    first = issue_reset_token(db_session, member_id, now)
    second = issue_reset_token(db_session, member_id, now + RESEND_INTERVAL)
    assert first is not None and second is not None

    assert _confirm(api_client, first, NEW_PASSWORD).status_code == 400
    assert _confirm(api_client, second, NEW_PASSWORD).status_code == 200


def test_find_id_answers_the_same_whether_the_account_exists(
    api_client: TestClient, account: AccountFactory
) -> None:
    account(*HEAD)

    known = api_client.post("/find-id", json={"name": HEAD[0], "email": HEAD[1]})
    unknown = api_client.post("/find-id", json={"name": HEAD[0], "email": UNKNOWN_EMAIL})

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_find_id_mails_the_registered_address_only_when_the_pair_matches(
    api_client: TestClient,
    account: AccountFactory,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    account(*HEAD)
    account(*OTHER)
    # 본문(로그인 아이디가 담긴 내용)을 확인하려면 개발 환경처럼 로그에 본문을 남기게 합니다.
    monkeypatch.setenv("MAIL_LOG_BODY", "true")

    with caplog.at_level(logging.INFO, logger="backend.services.mailer"):
        api_client.post("/find-id", json={"name": HEAD[0], "email": HEAD[1]})
        api_client.post("/find-id", json={"name": OTHER[0], "email": HEAD[1]})

    # 이름과 이메일이 함께 일치하는 첫 요청만 메일이 발송됩니다.
    mails = [record for record in caplog.records if HEAD[1] in record.getMessage()]
    assert len(mails) == 1
    # 메일 본문에 로그인 아이디가 담겨야 합니다 — 아이디 찾기의 목적이 이메일이 아니라 아이디를 알리는 것입니다.
    assert HEAD_LOGIN_ID in mails[0].getMessage()
