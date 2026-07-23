import os
from functools import lru_cache

from sqlalchemy import Engine, create_engine


@lru_cache(maxsize=None)
def _build_engine(url: str) -> Engine:
    # 엔진은 접속 풀을 통째로 들고 있는 무거운 객체라, 접속 주소별로 하나만 만들어
    # 재사용한다. get_engine()이 요청마다 불려도(FastAPI Depends) 여기서 막아
    # 요청마다 새 접속 풀이 열리는 것을 막는다.
    return create_engine(url)


def get_engine() -> Engine:
    """DATABASE_URL 환경변수로 접속 엔진을 만든다. 미설정이면 즉시 실패한다.

    같은 접속 주소로 여러 번 불러도 엔진(접속 풀)은 프로세스에 하나만 만들어 재사용한다.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")
    return _build_engine(url)
