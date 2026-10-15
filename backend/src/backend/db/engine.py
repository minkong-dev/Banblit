import os

from sqlalchemy import Engine, create_engine

DEFAULT_CONNECT_TIMEOUT = 5
DEFAULT_POOL_TIMEOUT = 10
# 쿼리 1개의 실행 상한(초)입니다. 배포 nginx 의 응답 대기 30초(proxy_read_timeout)보다 짧아야 api 가 503 으로 먼저 응답합니다.
DEFAULT_STATEMENT_TIMEOUT = 25
# 다른 요청이 잡은 행 잠금을 기다리는 상한(초)입니다.
DEFAULT_LOCK_TIMEOUT = 5


def _timeout_seconds(variable: str, fallback: int) -> int:
    # variable 환경변수의 값을 초 단위 정수로 반환합니다. 숫자가 아니거나 0 이하면 fallback 을 사용합니다.
    # 0 이하를 거부하는 이유는 psycopg 가 음수 connect_timeout 을 시간 제한 없음으로 받아들여
    # 의도한 시간 제한을 적용하지 못하기 때문입니다.
    try:
        seconds = int(os.environ.get(variable, ""))
    except ValueError:
        return fallback
    return seconds if seconds > 0 else fallback


def create_db_engine(url: str) -> Engine:
    # url 을 create_engine 에 넣어 connection pool 을 가진 Engine 을 반환합니다.
    # connect_timeout 은 psycopg 로 전달되어 connection 하나를 여는 데 대기하는 초입니다.
    # pool_timeout 은 이미 열린 connection 을 pool 에서 획득할 때까지 대기하는 초입니다.
    # pool_pre_ping 은 pool 에서 꺼낸 connection 이 유효한지 먼저 검증합니다.
    # options 는 connection 마다 PostgreSQL 의 statement_timeout, lock_timeout(밀리초)을 설정합니다. 넘으면 DB 가 그 문장을 취소하고
    # OperationalError 가 발생하며, api/app.py 가 503 으로 응답합니다.
    statement_ms = _timeout_seconds("DB_STATEMENT_TIMEOUT", DEFAULT_STATEMENT_TIMEOUT) * 1000
    lock_ms = _timeout_seconds("DB_LOCK_TIMEOUT", DEFAULT_LOCK_TIMEOUT) * 1000
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_timeout=_timeout_seconds("DB_POOL_TIMEOUT", DEFAULT_POOL_TIMEOUT),
        connect_args={
            "connect_timeout": _timeout_seconds("DB_CONNECT_TIMEOUT", DEFAULT_CONNECT_TIMEOUT),
            "options": f"-c statement_timeout={statement_ms} -c lock_timeout={lock_ms}",
        },
    )
