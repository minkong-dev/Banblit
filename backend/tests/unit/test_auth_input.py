import pytest

from backend.api.auth_input import require_email, require_name, require_password


def test_require_name_trims_surrounding_whitespace() -> None:
    assert require_name("  박서연  ") == "박서연"


def test_require_name_rejects_an_empty_string() -> None:
    with pytest.raises(ValueError, match="이름"):
        require_name("   ")


def test_require_email_accepts_a_well_formed_address() -> None:
    assert require_email(" a@example.com ") == "a@example.com"


@pytest.mark.parametrize("value", ["", "no-at-sign", "a@b", "a@b.c"])
def test_require_email_rejects_malformed_addresses(value: str) -> None:
    with pytest.raises(ValueError, match="이메일"):
        require_email(value)


def test_require_password_accepts_eight_characters_or_more() -> None:
    require_password("12345678")


def test_require_password_rejects_fewer_than_eight_characters() -> None:
    with pytest.raises(ValueError, match="비밀번호"):
        require_password("1234567")
