"""요청 제한. 같은 곳에서 짧은 시간에 몰아치는 요청을 거른다.

로그인처럼 값을 맞혀 보는 자리에 건다. 한 번에 하나씩 넣어 보는 것을 막지 못하면
짧은 비밀번호는 시간 문제로 뚫린다.

세는 자리는 process 안이다. api 를 여러 대로 늘리면 대마다 따로 세므로 실제 상한은
대수만큼 커진다. 지금은 한 대로 띄우므로 그대로 두고, 늘릴 때 저장소를 바깥(예:
Redis)으로 옮긴다.
"""

import time
from collections import OrderedDict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request

# 주소를 바꿔 가며 두드리면 기억이 무한히 쌓인다. 그 자체가 공격이 되므로 상한을 둔다.
DEFAULT_MAX_CALLERS = 10_000

# 만들어 둔 문지기들. 검사는 한 process 에서 여러 요청을 연달아 보내므로, 검사와 검사
# 사이에 이것을 비워야 앞 검사가 뒤 검사를 막지 않는다(tests/conftest.py).
_LIMITERS: "list[RateLimiter]" = []


def reset_all() -> None:
    """모든 문지기의 셈을 지운다. 검사 격리용이며 서버가 도는 중에는 부르지 않는다."""
    for limiter in _LIMITERS:
        limiter.clear()


class RateLimiter:
    """부르는 곳마다 최근 몇 번 왔는지를 세어, 상한을 넘으면 기다릴 초를 돌려준다."""

    def __init__(
        self, limit: int, window_seconds: float, max_callers: int = DEFAULT_MAX_CALLERS
    ) -> None:
        if limit < 1:
            raise ValueError("상한은 1 이상이어야 합니다")
        if window_seconds <= 0:
            raise ValueError("창 길이는 0보다 커야 합니다")
        self._limit = limit
        self._window = window_seconds
        self._max_callers = max_callers
        # 오래 안 보인 곳부터 버리려고 순서를 기억하는 dict 를 쓴다.
        self._seen: OrderedDict[str, deque[float]] = OrderedDict()

    def check(self, caller: str, now: float) -> int | None:
        """통과하면 None, 막히면 몇 초 뒤에 다시 오면 되는지를 돌려준다.

        막힌 요청은 세지 않는다 — 세면 계속 두드리는 동안 창이 밀려 영영 풀리지 않는다.
        """
        hits = self._seen.get(caller)
        if hits is None:
            hits = deque()
            self._seen[caller] = hits
        self._seen.move_to_end(caller)

        # 창을 벗어난 것은 잊는다.
        while hits and hits[0] <= now - self._window:
            hits.popleft()

        if len(hits) >= self._limit:
            # 가장 오래된 것이 창을 벗어나는 시각까지 남은 초. 0 을 주면 곧바로 다시 온다.
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


def caller_of(request: Request) -> str:
    """요청을 보낸 곳을 한 글자열로. 앞단이 있으면 앞단이 본 상대를 쓴다.

    앞단(caddy)은 자기가 본 상대를 X-Forwarded-For 맨 뒤에 붙인다. 앞쪽 값은 요청을
    보낸 쪽이 지어낼 수 있으므로 맨 뒤만 믿는다 — 앞단이 하나뿐일 때 맞는 규칙이고,
    앞단을 하나 더 두면 이 자리를 함께 고쳐야 한다.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        hops = [hop.strip() for hop in forwarded.split(",") if hop.strip()]
        if hops:
            return hops[-1]
    return request.client.host if request.client is not None else "unknown"


def limit_guesses(limit: int, window_seconds: float) -> Callable[[Request], None]:
    """이 endpoint 에 걸 문지기를 만든다. 상한을 넘으면 429 로 돌려보낸다.

    문지기마다 제 셈을 들고 있어, endpoint 하나가 막혀도 다른 곳은 그대로 열려 있다.
    """
    limiter = RateLimiter(limit=limit, window_seconds=window_seconds)
    _LIMITERS.append(limiter)

    def guard(request: Request) -> None:
        wait = limiter.check(caller_of(request), now=time.monotonic())
        if wait is None:
            return
        # 몇 번 남았는지는 알려주지 않는다 — 상한을 알면 그 아래로 맞춰 계속 두드린다.
        raise HTTPException(
            status_code=429,
            detail="요청이 너무 잦습니다. 잠시 뒤에 다시 시도해 주세요.",
            headers={"Retry-After": str(wait)},
        )

    return guard
