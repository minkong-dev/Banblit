"""rate limit(같은 요청자가 지정된 시간 안에 보낼 수 있는 요청 횟수 제한)입니다.

로그인처럼 값을 시도해 보는 endpoint(API의 요청 주소 단위)에 적용합니다. 비밀번호를 하나씩
시도하는 것을 막지 못하면 짧은 비밀번호는 시도 횟수만 충분하면 맞힐 수 있습니다.

요청을 세는 위치는 process 메모리입니다. API 서버를 여러 대로 확장하면 서버마다 따로 세므로
실제 상한은 서버 대수만큼 커집니다. 현재는 1대로 실행하므로 그대로 두고, 확장할 때 저장소를
외부(예: Redis)로 옮깁니다.
"""

import os
import time
from collections import OrderedDict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request

# api 앞에 있는 reverse proxy 의 개수를 담은 환경변수의 이름입니다. 배포는 Caddy → nginx → api 이므로 2,
# 개발은 nginx(또는 Vite) 하나이므로 기본값 1입니다(docker-compose.yml).
_PROXY_COUNT_VARIABLE = "TRUSTED_PROXY_COUNT"
DEFAULT_TRUSTED_PROXY_COUNT = 1

# IP 주소를 변경해 가며 요청하면 _seen 의 항목이 무한히 쌓입니다. 메모리를 고갈시키는 공격이 되므로 상한을 둡니다.
DEFAULT_MAX_CALLERS = 10_000

# 생성된 RateLimiter 전부입니다. 테스트는 한 process 에서 여러 요청을 연달아 보내므로, 테스트 사이에
# reset_all 로 초기화해야 앞 테스트의 요청이 뒤 테스트를 차단하지 않습니다(tests/conftest.py).
_LIMITERS: "list[RateLimiter]" = []


def reset_all() -> None:
    """모든 RateLimiter의 상태를 초기화합니다. 테스트 격리용이며 서버가 실행 중에는 호출하지 않습니다."""
    for limiter in _LIMITERS:
        limiter.clear()


class RateLimiter:
    """호출 주소마다 최근 요청 횟수를 추적하여, 상한을 초과하면 대기할 초를 반환합니다."""

    def __init__(
        self, limit: int, window_seconds: float, max_callers: int = DEFAULT_MAX_CALLERS
    ) -> None:
        if limit < 1:
            raise ValueError("상한은 1 이상이어야 합니다")
        if window_seconds <= 0:
            raise ValueError("window 길이는 0보다 커야 합니다")
        self._limit = limit
        self._window = window_seconds
        self._max_callers = max_callers
        # 오래 사용하지 않은 호출자부터 제거하려고 순서를 유지하는 dict를 사용합니다.
        self._seen: OrderedDict[str, deque[float]] = OrderedDict()

    def check(self, caller: str, now: float) -> int | None:
        """통과할 경우 None을, 차단할 경우 몇 초 뒤 재시도할 수 있는지를 반환합니다.

        차단된 요청은 계산하지 않습니다 — 계산하면 계속 요청하는 동안 window가 밀려 영구적으로 차단됩니다.
        """
        hits = self._seen.get(caller)
        if hits is None:
            hits = deque()
            self._seen[caller] = hits
        self._seen.move_to_end(caller)

        # window 를 벗어난 요청 시각은 제거합니다.
        while hits and hits[0] <= now - self._window:
            hits.popleft()

        if len(hits) >= self._limit:
            # 가장 오래된 요청이 window를 벗어날 때까지 남은 초를 반환합니다. 1초 이상으로 보장합니다.
            return max(1, int(hits[0] + self._window - now))

        hits.append(now)
        self._forget_oldest()
        return None

    def size(self) -> int:
        return len(self._seen)

    def clear(self) -> None:
        self._seen.clear()

    def _forget_oldest(self) -> None:
        while len(self._seen) > self._max_callers:
            self._seen.popitem(last=False)


def _trusted_proxy_count() -> int:
    # TRUSTED_PROXY_COUNT 환경변수를 읽습니다. 숫자가 아니거나 0 이하이면 기본값을 반환합니다.
    try:
        count = int(os.environ.get(_PROXY_COUNT_VARIABLE, ""))
    except ValueError:
        return DEFAULT_TRUSTED_PROXY_COUNT
    return count if count > 0 else DEFAULT_TRUSTED_PROXY_COUNT


def caller_of(request: Request) -> str:
    """요청 발신자를 한 문자열로 반환합니다. reverse proxy가 있으면 맨 앞 reverse proxy가 본 발신자를 사용합니다.

    reverse proxy는 각자 본인이 본 발신자를 X-Forwarded-For 헤더의 맨 뒤에 추가합니다. reverse proxy가
    N개이면 뒤에서 N번째 값이 맨 앞 reverse proxy가 본 발신자입니다. 그보다 앞의 값은 요청 발신자가
    조작할 수 있으므로 사용하지 않습니다. N은 TRUSTED_PROXY_COUNT 로 설정합니다.

    값의 개수가 N보다 적으면 reverse proxy를 거치지 않은 요청이므로 헤더를 사용하지 않습니다.
    """
    hops = [
        hop.strip()
        for hop in request.headers.get("x-forwarded-for", "").split(",")
        if hop.strip()
    ]
    count = _trusted_proxy_count()
    if len(hops) >= count:
        return hops[-count]
    return request.client.host if request.client is not None else "unknown"


def limit_guesses(limit: int, window_seconds: float) -> Callable[[Request], None]:
    """endpoint에 적용할 rate limiter를 생성합니다. 상한을 초과하면 429 상태를 반환합니다.

    각 limiter는 독립적인 상태를 유지하므로, 한 endpoint가 차단되어도 다른 endpoint는 그대로 열려 있습니다.
    """
    limiter = RateLimiter(limit=limit, window_seconds=window_seconds)
    _LIMITERS.append(limiter)

    def guard(request: Request) -> None:
        wait = limiter.check(caller_of(request), now=time.monotonic())
        if wait is None:
            return
        # 남은 시도 횟수를 알려주지 않습니다 — 상한을 알면 그 아래로 조절하여 계속 요청합니다.
        raise HTTPException(
            status_code=429,
            detail="요청이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요.",
            headers={"Retry-After": str(wait)},
        )

    return guard
