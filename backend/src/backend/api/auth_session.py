import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from backend.db.models import LoginSession

# 로그인 상태를 얼마나 유지할지. 화면의 "로그인 상태 유지" 체크는 지금 이 값을
# 갈아 끼우지 않는다 — 켜고 꺼도 만료 시각은 항상 같다.
# ponytail: remember-me로 만료를 달리하려면 로그인 요청에 값을 태워 create_session에 넘긴다.
SESSION_TTL = timedelta(days=7)

SESSION_COOKIE = "banblit_session"
SIGNED_IN_COOKIE = "banblit_signed_in"


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(session: Session, member_id: int, now: datetime) -> str:
    """새 세션 토큰을 만들어 저장하고, 토큰 원문을 돌려준다."""
    token = secrets.token_urlsafe(32)
    session.add(
        LoginSession(
            token_hash=_hash_token(token),
            member_id=member_id,
            expires_at=now + SESSION_TTL,
            created_at=now,
        )
    )
    session.commit()
    return token


def resolve_session(session: Session, token: str, now: datetime) -> LoginSession | None:
    """취소되지 않고 만료되지 않은 세션 행을 찾는다. 없으면 None."""
    row = session.scalar(
        select(LoginSession).where(LoginSession.token_hash == _hash_token(token))
    )
    if row is None or row.revoked_at is not None or row.expires_at < now:
        return None
    return row


def revoke_session(session: Session, token: str, now: datetime) -> None:
    """그 토큰의 세션을 취소한다. 없는 토큰이어도 조용히 끝난다 — 이미 로그아웃된
    것과 구분할 이유가 없다."""
    session.execute(
        update(LoginSession)
        .where(LoginSession.token_hash == _hash_token(token))
        .where(LoginSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    session.commit()


# ponytail: 만료된 세션 행이 계속 쌓인다. 행 수가 문제되면 주기적 삭제(배치 작업)를
# 붙인다 — 지금은 별도 정리 작업을 만들지 않는다.
