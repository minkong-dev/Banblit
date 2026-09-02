import os
from collections.abc import Iterator

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from backend.db.engine import create_db_engine

# 접속 주소 하나당 Engine 하나. Engine 은 접속 풀을 통째로 들고 있는 무거운 객체라,
# 요청마다 새로 만들면 요청 수만큼 풀이 열려 DB 접속이 고갈된다.
_engines: dict[str, Engine] = {}


def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")

    if url not in _engines:
        # create_db_engine 을 여기서만 부른다. 시간 제한이 붙지 않은 Engine 이
        # 다른 경로로 만들어지지 않도록, 만드는 자리를 한 곳으로 묶는다.
        _engines[url] = create_db_engine(url)
    return _engines[url]


def get_session() -> Iterator[Session]:
    # get_engine 으로 Engine 을 받아 Session 을 열고, 쓰는 쪽이 끝나면 닫는다.
    # 닫지 않으면 접속이 풀로 반납되지 않아 다음 요청이 풀 대기에서 막힌다.
    # 테스트는 FastAPI 의 의존성 덮어쓰기로 이 함수 대신 전용 세션을 넣는다.
    with Session(get_engine()) as session:
        yield session
