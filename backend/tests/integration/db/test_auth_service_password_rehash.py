"""login() 이 성공하는 순간 옛 강도 비밀번호를 새 형식으로 갈아 끼우는지 검증한다.

auth_service.hash_password/verify_password 는 DB 를 몰라도 되지만, 이 갈아 끼우기는
Member 행을 실제로 commit 해야 확인할 수 있어 tests/unit 이 아니라 여기(DB 딸림)에 둔다.
"""

import hashlib
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.auth_service import hash_password, login
from backend.db.models import Member


def _legacy_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"{salt.hex()}${derived.hex()}"


def _add_member(db_session: Session, *, password_hash: str) -> Member:
    member = Member(
        name="박서연",
        email="seoyeon@example.com",
        password_hash=password_hash,
        role="member",
    )
    db_session.add(member)
    db_session.commit()
    return member


def test_login_upgrades_a_legacy_hash_on_success(db_session: Session) -> None:
    _add_member(db_session, password_hash=_legacy_hash("password123"))

    login(db_session, "seoyeon@example.com", "password123")

    stored = db_session.scalar(
        select(Member.password_hash).where(Member.email == "seoyeon@example.com")
    )
    assert stored is not None
    assert stored.count("$") == 5
    assert stored.startswith("scrypt$")


def test_login_keeps_a_new_format_hash_unchanged(db_session: Session) -> None:
    new_hash = hash_password("password123")
    _add_member(db_session, password_hash=new_hash)

    login(db_session, "seoyeon@example.com", "password123")

    stored = db_session.scalar(
        select(Member.password_hash).where(Member.email == "seoyeon@example.com")
    )
    assert stored == new_hash


def test_login_rejects_a_wrong_password_for_a_legacy_hash(db_session: Session) -> None:
    _add_member(db_session, password_hash=_legacy_hash("password123"))

    try:
        login(db_session, "seoyeon@example.com", "wrong-password")
        raised = False
    except ValueError:
        raised = True

    assert raised is True
