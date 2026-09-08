from backend.api.auth_service import hash_password, verify_password


def test_hash_password_returns_the_labeled_new_format() -> None:
    stored = hash_password("correct-horse-battery")

    scheme, n, r, p, salt_hex, derived_hex = stored.split("$")
    assert scheme == "scrypt"
    assert int(n) > 0 and int(r) > 0 and int(p) > 0
    assert salt_hex and derived_hex


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
