import os
from collections.abc import Callable, Iterator
from functools import lru_cache

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from backend.db.commit import commit_translating
from backend.db.engine import create_db_engine
from backend.db.health import DependencyStatus, check_database as _check_database
from backend.db.schedule_store import (
    AssignmentRow,
    BackupRound,
    list_backup_rounds,
    rollback_schedule,
    save_schedule,
)


# db 모듈의 시퀀스 파일 — api 는 db 안의 다른 파일을 직접 부르지 않고 이 파일만
# 참조한다. save_schedule·rollback_schedule·list_backup_rounds·AssignmentRow·
# BackupRound 는 schedule_store.py 가 이미 가진 것을 그대로 내보낸다.
__all__ = [
    "get_engine",
    "get_session",
    "get_session_factory",
    "check_database",
    "commit_translating",
    "save_schedule",
    "rollback_schedule",
    "list_backup_rounds",
    "AssignmentRow",
    "BackupRound",
]

# 접속 주소 하나당 Engine 하나. Engine 은 접속 풀을 통째로 들고 있는 무거운 객체라,
# 요청마다 새로 만들면 요청 수만큼 풀이 열려 DB 접속이 고갈된다. lru_cache 가 같은
# 주소에는 같은 Engine 을 돌려준다.
@lru_cache
def _engine_for(url: str) -> Engine:
    # create_db_engine 을 여기서만 부른다. 시간 제한이 붙지 않은 Engine 이
    # 다른 경로로 만들어지지 않도록, 만드는 곳을 여기 하나로 묶는다.
    return create_db_engine(url)


def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")
    return _engine_for(url)


def get_session() -> Iterator[Session]:
    # get_engine 으로 Engine 을 받아 Session 을 열고, 쓰는 쪽이 끝나면 닫는다.
    # 닫지 않으면 접속이 풀로 반납되지 않아 다음 요청이 풀 대기에서 막힌다.
    # 테스트는 FastAPI 의 의존성 덮어쓰기로 이 함수 대신 전용 세션을 넣는다.
    with Session(get_engine()) as session:
        yield session


def get_session_factory() -> Callable[[], Session]:
    # 배경 스레드가 요청을 받은 스레드와 다른 세션을 열 때 쓴다. Session은 스레드끼리
    # 공유하면 안 되므로, 세션 객체가 아니라 "부를 때마다 새 세션을 여는 함수"를 준다.
    return lambda: Session(get_engine())


def check_database() -> DependencyStatus:
    # 지금 엔진으로 실제 접속과 마이그레이션 적용 여부를 본다.
    return _check_database(get_engine())
