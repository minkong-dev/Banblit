from collections.abc import Callable
from datetime import datetime

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.auth_session import SESSION_COOKIE, resolve_session
from backend.api.permission_service import account_permissions
from backend.db.models import Member, Permission
from backend.db.pipeline import get_session

# 모든 통로가 "지금 요청한 사람이 누구인가"를 확인하는 자리를 여기 하나로 모은다.
# 라우터는 이 함수를 Depends로만 물리고, 쿠키를 직접 들여다보지 않는다.
# 항목 하나가 필요한 통로는 require_permission("항목 이름") 을 대신 물린다.
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


FORBIDDEN_DETAIL = "권한이 없습니다"


def require_permission(permission: Permission) -> Callable[..., Member]:
    """permission 항목이 켜진 사람만 통과시키는 확인 함수를 만들어 돌려준다.

    라우터는 Depends(require_permission("room_manage")) 처럼 만들어진 함수를 문다.
    가진 항목은 묶음 여럿의 합집합이라, 하나라도 켜져 있으면 통과한다.
    """

    def check(
        account: Member = Depends(require_account),
        session: Session = Depends(get_session),
    ) -> Member:
        if permission not in account_permissions(session, account.id):
            raise HTTPException(status_code=403, detail=FORBIDDEN_DETAIL)
        return account

    return check
