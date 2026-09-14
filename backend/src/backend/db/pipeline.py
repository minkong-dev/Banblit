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


# db 모듈의 진입점 파일입니다. api 는 db 안의 다른 파일을 직접 호출하지 않고 이 파일만
# 참조합니다. save_schedule·rollback_schedule·list_backup_rounds·AssignmentRow·
# BackupRound 는 schedule_store.py 에서 정의한 것을 그대로 재공개합니다.
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

# connection 주소 하나당 Engine 하나입니다. Engine 은 connection pool 을 통째로 들고 있는
# 무거운 객체이므로 매 요청마다 새로 생성하면 요청 수만큼 pool 이 열려 DB connection 이
# 고갈됩니다. lru_cache 가 같은 주소에는 같은 Engine 을 반환합니다.
@lru_cache
def _engine_for(url: str) -> Engine:
    # create_db_engine 을 이 함수에서만 호출합니다. 시간 제한이 적용된 Engine 이
    # 다른 경로로 생성되지 않도록 생성 지점을 하나로 통일합니다.
    return create_db_engine(url)


def get_engine() -> Engine:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")
    return _engine_for(url)


def get_session() -> Iterator[Session]:
    # get_engine 으로 Engine 을 획득하여 Session 을 열고, 사용자가 완료하면 닫습니다.
    # 세션을 닫지 않으면 connection 이 pool 에 반납되지 않아 다음 요청이 pool 대기에서
    # 차단됩니다. 테스트는 FastAPI 의 의존성 재정의로 이 함수 대신 전용 세션을 대체합니다.
    with Session(get_engine()) as session:
        yield session


def get_session_factory() -> Callable[[], Session]:
    # 배경 스레드가 요청을 받은 스레드와 다른 세션을 열어야 할 때 사용합니다. Session 은 스레드끼리
    # 공유하면 안 되므로 세션 객체가 아니라 "호출할 때마다 새 세션을 여는 함수"를 반환합니다.
    return lambda: Session(get_engine())


def check_database() -> DependencyStatus:
    # 현재 engine 으로 실제 connection 과 migration 적용 상태를 검증합니다.
    return _check_database(get_engine())
