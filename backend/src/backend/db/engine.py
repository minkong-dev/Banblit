import os

from sqlalchemy import Engine, create_engine


def get_engine() -> Engine:
    """DATABASE_URL 환경변수로 접속 엔진을 만든다. 미설정이면 즉시 실패한다."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")
    return create_engine(url)
