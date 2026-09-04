import hashlib
import secrets

from backend.api.auth_service import hash_password, verify_password


def _legacy_hash(password: str) -> str:
    """옛 형식("소금$파생값" 두 토막)을 직접 만든다 — 옛 강도(n=2**14, r=8, p=1,
    dklen=32)로 계산해, 이미 저장돼 있던 계정을 흉내낸다."""
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"{salt.hex()}${derived.hex()}"


def test_hash_password_returns_the_labeled_new_format() -> None:
    stored = hash_password("correct-horse-battery")

    scheme, n, r, p, salt_hex, derived_hex = stored.split("$")
    assert scheme == "scrypt"
    assert int(n) > 0 and int(r) > 0 and int(p) > 0
    assert salt_hex and derived_hex


def test_verify_password_accepts_a_legacy_two_part_hash() -> None:
    stored = _legacy_hash("correct-horse-battery")

    assert verify_password("correct-horse-battery", stored) is True


def test_verify_password_rejects_the_wrong_password_for_a_legacy_hash() -> None:
    stored = _legacy_hash("correct-horse-battery")

    assert verify_password("wrong-password", stored) is False


def test_verify_password_accepts_the_correct_password() -> None:
    stored = hash_password("correct-horse-battery")

    assert verify_password("correct-horse-battery", stored) is True


def test_verify_password_rejects_the_wrong_password() -> None:
    stored = hash_password("correct-horse-battery")

    assert verify_password("wrong-password", stored) is False


def test_hash_password_salts_each_call_differently() -> None:
    # 같은 비밀번호라도 매번 다른 소금을 써서, 저장된 값만 보고 같은 비밀번호를
    # 쓰는 두 계정을 알아낼 수 없게 한다.
    assert hash_password("same-password") != hash_password("same-password")
