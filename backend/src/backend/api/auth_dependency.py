from datetime import datetime

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.auth_session import SESSION_COOKIE, resolve_session
from backend.db.models import Member
from backend.db.pipeline import get_session

# 모든 통로가 "지금 요청한 사람이 누구인가"를 확인하는 자리를 여기 하나로 모은다.
# 라우터는 이 함수를 Depends로만 물리고, 쿠키를 직접 들여다보지 않는다.
UNAUTHORIZED_DETAIL = "로그인이 필요합니다"


def require_account(
    banblit_session: str | None = Cookie(default=None),
    session: Session = Depends(get_session),
) -> Member:
    if banblit_session is None:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_DETAIL)

    login_session = resolve_session(session, banblit_session, datetime.now())
    if login_session is None:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_DETAIL)

    account = session.get(Member, login_session.member_id)
    if account is None or account.password_hash is None:
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_DETAIL)
    return account
