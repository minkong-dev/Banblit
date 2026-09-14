import logging
from dataclasses import dataclass

from sqlalchemy import Engine, text

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DependencyStatus:
    ok: bool
    detail: str


def check_database(engine: Engine) -> DependencyStatus:
    # 실제로 접속해 SELECT 1을 실행하고, alembic_version에서 적용된 migration(데이터베이스
    # 스키마 변경) 번호를 읽어 detail에 포함합니다. 번호가 없으면 alembic_version table
    # (데이터베이스의 행과 열로 이루어진 데이터 구조)은 있는데 아직 초기화 준비가 완료되지
    # 않은 상태입니다. 접속 대기는 create_db_engine의 connect_timeout이 제한합니다.
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()
    except Exception as error:
        # 드라이버 연결 문자열에는 호스트, 사용자, 비밀번호가 포함됩니다. /health는 인증 없이
        # 공개되어 있으므로 원문은 로그에만 남기고 응답에는 한 줄만 포함합니다.
        logger.warning("데이터베이스 정상 확인 실패: %s", error)
        return DependencyStatus(ok=False, detail="데이터베이스에 접속하지 못했습니다")

    if revision is None:
        return DependencyStatus(ok=False, detail="마이그레이션이 적용되지 않았습니다")
    return DependencyStatus(ok=True, detail=f"revision={revision}")
