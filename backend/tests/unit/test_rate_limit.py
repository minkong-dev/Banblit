"""요청 제한 — 같은 곳에서 짧은 시간에 몰아치는 요청을 거른다.

로그인처럼 값을 맞혀 보는 자리가 대상이다. 비밀번호를 한 번에 하나씩 넣어 보는
것을 막을 수 없다면, 짧은 비밀번호는 시간 문제로 뚫린다.
"""

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from backend.api.rate_limit import RateLimiter, caller_of, limit_guesses


def test_allows_up_to_the_limit() -> None:
    limiter = RateLimiter(limit=3, window_seconds=60)

    assert limiter.check("1.2.3.4", now=0.0) is None
    assert limiter.check("1.2.3.4", now=1.0) is None
    assert limiter.check("1.2.3.4", now=2.0) is None


def test_rejects_past_the_limit_and_says_how_long_to_wait() -> None:
    limiter = RateLimiter(limit=2, window_seconds=60)
    limiter.check("1.2.3.4", now=0.0)
    limiter.check("1.2.3.4", now=10.0)

    retry_after = limiter.check("1.2.3.4", now=20.0)

    # 가장 오래된 것이 창을 벗어날 때까지 남은 초. 0 초를 돌려주면 곧바로 다시 온다.
    assert retry_after == 40


def test_counts_each_caller_separately() -> None:
    # 한 사람이 막혔다고 옆 사람까지 막히면 안 된다.
    limiter = RateLimiter(limit=1, window_seconds=60)
    limiter.check("1.2.3.4", now=0.0)

    assert limiter.check("5.6.7.8", now=0.0) is None


def test_forgets_what_fell_out_of_the_window() -> None:
    limiter = RateLimiter(limit=2, window_seconds=60)
    limiter.check("1.2.3.4", now=0.0)
    limiter.check("1.2.3.4", now=1.0)

    # 창(60초)을 지나면 앞의 둘은 세지 않는다.
    assert limiter.check("1.2.3.4", now=61.5) is None


def test_a_rejected_try_does_not_extend_the_block() -> None:
    # 막힌 요청까지 세면, 계속 두드리는 동안 영영 풀리지 않는다.
    limiter = RateLimiter(limit=1, window_seconds=60)
    limiter.check("1.2.3.4", now=0.0)

    limiter.check("1.2.3.4", now=10.0)
    limiter.check("1.2.3.4", now=20.0)

    assert limiter.check("1.2.3.4", now=61.0) is None


def test_does_not_grow_without_bound() -> None:
    # 주소를 바꿔 가며 두드리면 기억이 무한히 쌓인다. 그 자체가 공격이 된다.
    limiter = RateLimiter(limit=1, window_seconds=60, max_callers=100)

    for index in range(500):
        limiter.check(f"10.0.0.{index}", now=float(index))

    assert limiter.size() <= 100


def test_rejects_a_limit_that_would_let_everything_through() -> None:
    with pytest.raises(ValueError):
        RateLimiter(limit=0, window_seconds=60)


def _request(client_host: str | None, forwarded: str | None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    scope: dict[str, object] = {"type": "http", "headers": headers}
    if client_host is not None:
        scope["client"] = (client_host, 12345)
    return Request(scope)


def test_caller_is_the_peer_when_nothing_is_in_front() -> None:
    assert caller_of(_request("203.0.113.9", None)) == "203.0.113.9"


def test_caller_is_what_the_proxy_saw_not_what_the_client_claimed() -> None:
    # 앞단(caddy)은 자기가 본 상대를 X-Forwarded-For 맨 뒤에 붙인다. 앞쪽 값은
    # 요청을 보낸 쪽이 지어낼 수 있으므로 맨 뒤만 믿는다.
    request = _request("172.18.0.5", "1.1.1.1, 2.2.2.2, 203.0.113.9")

    assert caller_of(request) == "203.0.113.9"


def test_caller_falls_back_when_there_is_no_peer() -> None:
    # TestClient 처럼 client 가 비어 오는 경우가 있다. 그때도 값 하나로 세어야 한다.
    assert caller_of(_request(None, None)) == "unknown"


def test_endpoint_answers_429_with_how_long_to_wait() -> None:
    app = FastAPI()
    guard = limit_guesses(limit=2, window_seconds=60)

    @app.post("/try", dependencies=[Depends(guard)])
    def attempt() -> dict[str, bool]:
        return {"ok": True}

    client = TestClient(app)
    assert client.post("/try").status_code == 200
    assert client.post("/try").status_code == 200

    blocked = client.post("/try")

    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0
    assert "잠시" in blocked.json()["detail"]
