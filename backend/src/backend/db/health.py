import logging
from dataclasses import dataclass

from sqlalchemy import text

from backend.db.pipeline import get_engine

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DependencyStatus:
    ok: bool
    detail: str


def check_database() -> DependencyStatus:
    # 실제로 접속해 SELECT 1 을 던지고, alembic_version 에서 적용된 마이그레이션
    # 번호를 읽어 detail 에 담는다. 번호가 없으면 표는 있는데 아직 기동 준비가
    # 안 끝난 상태다. 접속 대기는 create_db_engine 의 connect_timeout 이 끊는다.
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()
    except Exception as error:
        logger.warning("데이터베이스 정상 확인 실패: %s", error)
        return DependencyStatus(ok=False, detail=str(error))

    if revision is None:
        return DependencyStatus(ok=False, detail="마이그레이션이 적용되지 않았습니다")
    return DependencyStatus(ok=True, detail=f"revision={revision}")
