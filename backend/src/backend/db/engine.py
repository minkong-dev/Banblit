import os

from sqlalchemy import Engine, create_engine

DEFAULT_CONNECT_TIMEOUT = 5
DEFAULT_POOL_TIMEOUT = 10


def _timeout_seconds(variable: str, fallback: int) -> int:
    # variable 환경변수의 값을 초 단위 정수로 돌려준다. 숫자가 아니거나 0 이하면 fallback.
    # 0 이하를 걸러내는 이유는 psycopg 가 음수 connect_timeout 을 시간 제한 없음으로
    # 받아들여, 막으려던 무한 대기가 그대로 생기기 때문이다.
    try:
        seconds = int(os.environ.get(variable, ""))
    except ValueError:
        return fallback
    return seconds if seconds > 0 else fallback


def create_db_engine(url: str) -> Engine:
    # url 을 create_engine 에 넣어 접속 풀을 가진 Engine 을 돌려준다.
    # connect_timeout 은 psycopg 로 그대로 넘어가 접속 하나를 여는 데 기다리는 초,
    # pool_timeout 은 이미 열린 접속을 풀에서 받을 때까지 기다리는 초다.
    # pool_pre_ping 은 풀에서 꺼낸 접속이 살아 있는지 먼저 확인한다.
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_timeout=_timeout_seconds("DB_POOL_TIMEOUT", DEFAULT_POOL_TIMEOUT),
        connect_args={
            "connect_timeout": _timeout_seconds(
                "DB_CONNECT_TIMEOUT", DEFAULT_CONNECT_TIMEOUT
            )
        },
    )
