from collections.abc import Iterator

from sqlalchemy.orm import Session

from backend.db.engine import get_engine


def get_session() -> Iterator[Session]:
    """요청 하나가 쓸 DB 세션을 내주고, 끝나면 닫는다.

    테스트에서는 FastAPI의 의존성 덮어쓰기로 테스트 전용 세션을 대신 넣는다.
    """
    with Session(get_engine()) as session:
        yield session
