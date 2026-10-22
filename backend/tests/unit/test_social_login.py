import io
from collections.abc import Callable
from http.client import RemoteDisconnected
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request

import pytest

from backend.services.auth import social_login
from backend.services.auth.social_login import PROVIDER_FAILED, authorize_url, fetch_provider_user_id, provider_config

FakeHttp = Callable[[Request, float], dict[str, object]]

REDIRECT = "https://banblit.example/api/social/google/callback"


def test_google_without_a_secret_is_disabled() -> None:
    assert provider_config("google", "id", "") is None
    assert provider_config("google", "", "secret") is None


def test_kakao_needs_only_the_client_id() -> None:
    config = provider_config("kakao", "rest-key", "")

    assert config is not None
    assert config.user_id_key == "id"


def test_authorize_url_carries_client_redirect_and_state() -> None:
    config = provider_config("google", "id-1", "secret-1")
    assert config is not None

    url = urlparse(authorize_url(config, REDIRECT, "state-xyz"))
    query = parse_qs(url.query)

    assert url.netloc == "accounts.google.com"
    assert query["client_id"] == ["id-1"]
    assert query["redirect_uri"] == [REDIRECT]
    assert query["state"] == ["state-xyz"]
    assert query["response_type"] == ["code"]
    assert query["scope"] == ["openid"]


def _fake_http(answers: list[dict[str, object]], seen: list[Request]) -> FakeHttp:
    def http(request: Request, timeout: float) -> dict[str, object]:
        seen.append(request)
        return answers.pop(0)

    return http


def test_the_code_is_exchanged_for_the_user_id(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[Request] = []
    monkeypatch.setattr(social_login, "_http_json", _fake_http([{"access_token": "tok"}, {"sub": "google-77"}], seen))
    config = provider_config("google", "id-1", "secret-1")
    assert config is not None

    user_id = fetch_provider_user_id(config, "code-1", REDIRECT, 5.0)

    assert user_id == "google-77"
    token_form = parse_qs(seen[0].data.decode())  # type: ignore[union-attr]
    assert token_form["code"] == ["code-1"]
    assert token_form["client_secret"] == ["secret-1"]
    assert seen[1].get_header("Authorization") == "Bearer tok"


def test_kakao_integer_id_is_stored_as_text(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(social_login, "_http_json", _fake_http([{"access_token": "tok"}, {"id": 123456}], []))
    config = provider_config("kakao", "rest-key", "")
    assert config is not None

    assert fetch_provider_user_id(config, "code-1", REDIRECT, 5.0) == "123456"


def test_a_missing_access_token_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(social_login, "_http_json", _fake_http([{"error": "invalid_grant"}], []))
    config = provider_config("google", "id-1", "secret-1")
    assert config is not None

    with pytest.raises(ValueError):
        fetch_provider_user_id(config, "code-1", REDIRECT, 5.0)


def _google() -> social_login.ProviderConfig:
    config = provider_config("google", "id-1", "secret-1")
    assert config is not None
    return config


def _urlopen_raising(error: Exception) -> Callable[..., object]:
    def urlopen(request: Request, timeout: float) -> object:
        raise error

    return urlopen


@pytest.mark.parametrize(
    "error",
    [
        HTTPError("https://oauth2.googleapis.com/token", 400, "Bad Request", {}, io.BytesIO(b'{"error":"invalid_grant"}')),  # type: ignore[arg-type]
        RemoteDisconnected("Remote end closed connection"),
        ConnectionResetError(),
        TimeoutError(),
    ],
)
def test_provider_failures_become_one_fixed_message(monkeypatch: pytest.MonkeyPatch, error: Exception) -> None:
    monkeypatch.setattr(social_login, "urlopen", _urlopen_raising(error))

    with pytest.raises(ValueError, match=PROVIDER_FAILED):
        fetch_provider_user_id(_google(), "code-1", REDIRECT, 5.0)


def test_a_non_object_body_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    class Response(io.BytesIO):
        def __enter__(self) -> "Response":
            return self

        def __exit__(self, *args: object) -> None:
            self.close()

    monkeypatch.setattr(social_login, "urlopen", lambda request, timeout: Response(b"[1, 2]"))

    with pytest.raises(ValueError, match=PROVIDER_FAILED):
        fetch_provider_user_id(_google(), "code-1", REDIRECT, 5.0)


@pytest.mark.parametrize("user_id", [True, {"id": 1}, [1], ""])
def test_a_user_id_that_is_not_text_or_a_number_is_rejected(monkeypatch: pytest.MonkeyPatch, user_id: object) -> None:
    monkeypatch.setattr(social_login, "_http_json", _fake_http([{"access_token": "tok"}, {"sub": user_id}], []))

    with pytest.raises(ValueError):
        fetch_provider_user_id(_google(), "code-1", REDIRECT, 5.0)
