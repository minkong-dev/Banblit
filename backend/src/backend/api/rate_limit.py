"""rate limit(같은 요청자가 지정된 시간 안에 보낼 수 있는 요청 횟수 제한)입니다.

로그인처럼 값을 시도하는 endpoint(API의 요청 주소 단위)에 적용합니다.

요청 횟수는 process 메모리에 셉니다. API 서버를 2대 이상으로 실행할 경우 서버마다 따로 세므로 실제 상한은 서버 대수만큼 커집니다.
"""

import os
import time
# OrderedDict 는 항목을 넣은 순서를 기억하고 move_to_end, popitem(last=False) 로 가장 오래된 항목을 꺼낼 수 있는 dict 입니다.
# deque 는 양쪽 끝에서 넣고 빼는 비용이 일정한 목록입니다. 오래된 요청 시각을 앞에서 빼는 데 씁니다.
from collections import OrderedDict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request

# reverse proxy 는 사용자의 요청을 대신 받아 api 로 전달하는 서버입니다. 배포에서는 Caddy(TLS 종료)와 nginx(화면 파일 제공)가 그 역할이라
# api 가 보는 발신 주소는 proxy 의 주소이고, 실제 발신자는 X-Forwarded-For header 에서 읽어야 합니다.
# api 앞에 있는 reverse proxy 개수를 담은 환경변수의 이름입니다. 배포는 Caddy, nginx, api 순서라 2(docker-compose.yml),
# 개발은 nginx 또는 Vite 1개라 1(docker-compose.override.yml)입니다. 환경변수가 없으면 배포 값입니다.
_PROXY_COUNT_VARIABLE = "TRUSTED_PROXY_COUNT"
DEFAULT_TRUSTED_PROXY_COUNT = 2

# IP 주소를 변경해 가며 요청하면 _seen 의 항목이 무한히 쌓입니다. 메모리를 고갈시키는 공격이 되므로 상한을 둡니다.
# 숫자 사이의 _ 는 자릿수 구분 기호로, 10_000 은 10000 과 같은 값입니다.
DEFAULT_MAX_CALLERS = 10_000

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

        차단된 요청은 hits 에 추가하지 않습니다. 추가할 경우 요청을 계속 보내는 동안 가장 오래된 요청 시각이 window 를 벗어나지 않아 차단이 해제되지 않습니다.
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
            # hits[0] + window 가 그 요청이 window 밖으로 나가는 시각이고, 거기서 now 를 빼면 남은 초입니다.
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


def limit_guesses(name: str) -> Callable[[Request], None]:
    """app.state.limiters 의 name RateLimiter 로 요청을 세는 endpoint dependency 를 반환합니다. 상한을 초과하면 429 HTTPException 을 발생시킵니다.

    RateLimiter 는 이름마다 따로 세므로, endpoint 1개가 차단되어도 다른 endpoint 는 차단되지 않습니다.
    """

    def guard(request: Request) -> None:
        limiter: RateLimiter = request.app.state.limiters[name]
        # time.monotonic 은 시스템 시계를 변경해도 되돌아가지 않는 경과 시간입니다. time.time 은 시계를 뒤로 맞추면 차단이 풀리지 않습니다.
        wait = limiter.check(caller_of(request), now=time.monotonic())
        if wait is None:
            return
        # 남은 시도 횟수를 알려주지 않습니다 — 상한을 알면 그 아래로 조절하여 계속 요청합니다.
        raise HTTPException(
            status_code=429,
            detail="요청이 너무 많아요. 잠시 후 다시 시도해주세요",
            headers={"Retry-After": str(wait)},
        )

    return guard
