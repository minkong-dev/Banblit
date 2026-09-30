import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from backend.db.models import LoginSession

# 로그인 상태 유지를 비활성화한 사람의 session(로그인 상태를 담는 서버 쪽 기록) 유효 기간입니다. 브라우저를 닫으면 쿠키가 삭제되므로, 이 값은 "브라우저를 계속 켜 둔 사람"에게만 적용됩니다.
SESSION_TTL = timedelta(days=7)

# 로그인 상태 유지를 활성화한 사람의 session 유효 기간입니다. 쿠키에도 같은 값을 설정해야 합니다. 한쪽만 길면 짧은 쪽이 먼저 만료되어 로그인이 해제됩니다.
KEEP_TTL = timedelta(days=90)

SESSION_COOKIE = "banblit_session"
SIGNED_IN_COOKIE = "banblit_signed_in"


def hash_token(token: str) -> str:
    """token(임시로 발급하는 인증 문자열)의 원문을 일방향 해시로 변환합니다. 저장 및 조회 모두 이 값을 사용합니다."""
    return hashlib.sha256(token.encode()).hexdigest()


def _delete_dead_sessions(session: Session, member_id: int, now: datetime) -> None:
    """해당 계정의 만료된(expires_at < now) 행과 취소된(revoked_at이 채워진) 행을 삭제합니다.

    두 경우 모두 resolve_session 에서 이미 거절되는 행이므로, 남겨 둬도 로그인에 사용되지 않습니다.
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
    """새 session token(임시로 발급하는 인증 문자열)을 생성하여 저장하고, token 원문을 반환합니다.

    쌓인 만료된 행은 새 행과 같은 commit 에서 함께 삭제합니다. 로그인·가입이 sessions
    table 에 행을 추가하는 유일한 코드이므로, 이 함수 외에 삭제할 곳이 없습니다.

    ponytail: 로그인하지 않는 계정의 행은 계속 남습니다. 해당 계정 수가 문제되면
    주기적 삭제를 추가합니다. 현재 이 저장소에는 scheduled(시간을 지정해 자동으로 실행하는) 작업 기능이 없습니다.
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
    """취소되지 않고 만료되지 않은 session 행을 찾습니다. 없으면 None 을 반환합니다."""
    row = session.scalar(
        select(LoginSession).where(LoginSession.token_hash == hash_token(token))
    )
    if row is None or row.revoked_at is not None or row.expires_at < now:
        return None
    return row


def revoke_session(session: Session, token: str, now: datetime) -> None:
    """해당 token 의 session 을 취소합니다. 존재하지 않는 token 이어도 오류를 발생시키지 않습니다. 이미 로그아웃된 token 과 구분할 필요가 없기 때문입니다."""
    session.execute(
        update(LoginSession)
        .where(LoginSession.token_hash == hash_token(token))
        .where(LoginSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    session.commit()


def revoke_member_sessions(session: Session, member_id: int, now: datetime) -> None:
    """해당 계정의 활성 session 전부에 revoked_at 을 설정합니다. commit 은 호출자가 수행합니다.
    비밀번호 변경과 같은 commit 에 함께 포함되어야 둘 중 하나만 성공하는 상태를 피할 수 있습니다."""
    session.execute(
        update(LoginSession)
        .where(LoginSession.member_id == member_id, LoginSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
