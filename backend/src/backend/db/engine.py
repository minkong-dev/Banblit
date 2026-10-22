import logging
from dataclasses import dataclass

from sqlalchemy import Engine, create_engine, text

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = 5
POOL_TIMEOUT = 10
# 쿼리 1개의 실행 상한(초)입니다. 배포 nginx 의 응답 대기 30초(proxy_read_timeout)보다 짧아야 api 가 503 으로 먼저 응답합니다.
STATEMENT_TIMEOUT = 25
# 다른 요청이 잡은 행 잠금을 기다리는 상한(초)입니다.
LOCK_TIMEOUT = 5


def create_db_engine(url: str) -> Engine:
    # url 을 create_engine 에 넣어 connection pool 을 가진 Engine 을 반환합니다.
    # connect_timeout 은 psycopg 로 전달되어 connection 하나를 여는 데 대기하는 초입니다.
    # pool_timeout 은 이미 열린 connection 을 pool 에서 획득할 때까지 대기하는 초입니다.
    # pool_pre_ping 은 pool 에서 꺼낸 connection 이 유효한지 먼저 검증합니다.
    # options 는 PostgreSQL 서버 시작 옵션 문자열이고, -c 이름=값 이 그 connection 의 설정 변수 1개를 지정합니다.
    # 여기서는 connection 마다 statement_timeout, lock_timeout(밀리초)을 설정합니다. 넘으면 DB 가 그 문장을 취소하고
    # OperationalError 가 발생하며, api/app.py 가 503 으로 응답합니다.
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_timeout=POOL_TIMEOUT,
        connect_args={
            "connect_timeout": CONNECT_TIMEOUT,
            "options": f"-c statement_timeout={STATEMENT_TIMEOUT * 1000} -c lock_timeout={LOCK_TIMEOUT * 1000}",
        },
    )


@dataclass(frozen=True)
class DependencyStatus:
    ok: bool
    detail: str


def check_database(engine: Engine) -> DependencyStatus:
    # 실제로 접속해 SELECT 1을 실행하고, alembic_version에서 적용된 migration(데이터베이스
    # 스키마 변경) 번호를 읽어 detail에 포함합니다. alembic 은 migration 도구이고, alembic_version 은 alembic 이
    # 마지막으로 적용한 revision 번호 1개를 보관하는 table 입니다. 번호가 없으면 alembic_version table
    # (데이터베이스의 행과 열로 이루어진 데이터 구조)은 있는데 migration 이 한 번도 적용되지
    # 않은 상태입니다. 접속 대기 시간은 create_db_engine 의 connect_timeout 이 제한합니다.
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()
    except Exception as error:
        # 드라이버 연결 문자열에는 호스트, 사용자, 비밀번호가 포함됩니다. /health는 인증 없이
        # 공개되어 있으므로 원문은 로그에만 남기고 응답에는 한 줄만 포함합니다.
        logger.warning("데이터베이스 health check 실패: %s", error)
        return DependencyStatus(ok=False, detail="데이터베이스에 접속하지 못했습니다")

    if revision is None:
        return DependencyStatus(ok=False, detail="migration 이 적용되지 않았습니다")
    return DependencyStatus(ok=True, detail=f"revision={revision}")
