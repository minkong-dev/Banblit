import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from backend.db.models import LoginSession

# 로그인 상태 유지를 끈 사람의 수명. 브라우저를 닫으면 쿠키가 사라지므로 이 값은
# "브라우저를 계속 켜 둔 사람"에게만 걸린다.
SESSION_TTL = timedelta(days=7)

# 로그인 상태 유지를 켠 사람의 수명. 쿠키에도 같은 값을 실어야 한다 — 한쪽만 길면
# 짧은 쪽이 먼저 끝나 로그인이 풀린다.
KEEP_TTL = timedelta(days=90)

SESSION_COOKIE = "banblit_session"
SIGNED_IN_COOKIE = "banblit_signed_in"


def hash_token(token: str) -> str:
    """토큰 원문을 되돌릴 수 없게 줄인 지문으로 바꾼다. 저장·조회 모두 이 값으로 한다."""
    return hashlib.sha256(token.encode()).hexdigest()


def _delete_dead_sessions(session: Session, member_id: int, now: datetime) -> None:
    """그 계정의 만료된(expires_at < now) 행과 취소된(revoked_at이 채워진) 행을 지운다.

    둘 다 resolve_session이 이미 거절하는 행이라, 남겨 둬도 로그인에 쓰이지 않는다.
    """
    session.execute(
        delete(LoginSession).where(
            LoginSession.member_id == member_id,
            or_(LoginSession.expires_at < now, LoginSession.revoked_at.is_not(None)),
        )
    )


def create_session(
    session: Session, member_id: int, now: datetime, keep: bool = False
) -> str:
    """새 세션 토큰을 만들어 저장하고, 토큰 원문을 돌려준다.

    쌓인 죽은 행은 새 행과 같은 커밋에서 함께 지운다 — 로그인·가입이 login_sessions
    table 에 행을 더하는 유일한 코드라서, 여기 말고 정리할 곳이 없다.

    ponytail: 로그인하지 않는 계정의 행은 계속 남는다. 그 계정 수가 문제되면
    주기적 삭제를 붙인다 — 지금 이 저장소에는 예약 실행 장치가 없다.
    """
    _delete_dead_sessions(session, member_id, now)
    token = secrets.token_urlsafe(32)
    session.add(
        LoginSession(
            token_hash=hash_token(token),
            member_id=member_id,
            expires_at=now + (KEEP_TTL if keep else SESSION_TTL),
            created_at=now,
        )
    )
    session.commit()
    return token


def resolve_session(session: Session, token: str, now: datetime) -> LoginSession | None:
    """취소되지 않고 만료되지 않은 세션 행을 찾는다. 없으면 None."""
    row = session.scalar(
        select(LoginSession).where(LoginSession.token_hash == hash_token(token))
    )
    if row is None or row.revoked_at is not None or row.expires_at < now:
        return None
    return row


def revoke_session(session: Session, token: str, now: datetime) -> None:
    """그 토큰의 세션을 취소한다. 없는 토큰이어도 조용히 끝난다 — 이미 로그아웃된
    것과 구분할 이유가 없다."""
    session.execute(
        update(LoginSession)
        .where(LoginSession.token_hash == hash_token(token))
        .where(LoginSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    session.commit()


def revoke_member_sessions(session: Session, member_id: int, now: datetime) -> None:
    """그 계정의 살아 있는 세션 전부에 끊긴 표시를 남긴다. 커밋은 부르는 쪽이 한다 —
    비밀번호 변경과 같은 커밋에 묶여야 둘 중 하나만 남는 상태가 생기지 않는다."""
    session.execute(
        update(LoginSession)
        .where(LoginSession.member_id == member_id, LoginSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
