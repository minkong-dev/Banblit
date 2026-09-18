from collections.abc import Callable
from datetime import datetime

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.services.auth_session import SESSION_COOKIE, resolve_session
from backend.services.permission_service import account_permissions
from backend.db.models import Member, Permission
from backend.db.pipeline import get_session

# 모든 endpoint(API의 요청 주소 단위)가 현재 요청자를 확인하는 코드를 이 모듈에 모았습니다.
# 라우터는 require_account 를 Depends 로만 추가하고, cookie(브라우저가 저장해 두었다가 요청마다
# 헤더에 함께 보내는 값)를 직접 참조하지 않습니다. 특정 권한이 필요한 endpoint 는
# require_permission("권한 이름") 을 대신 추가합니다.
UNAUTHORIZED_DETAIL = "로그인이 필요합니다"


def require_account(
    banblit_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
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
    """permission(권한)이 설정된 사용자만 통과하게 하는 검증 함수를 반환합니다.

    라우터는 Depends(require_permission("room_edit")) 형식으로 반환된 함수를 추가합니다.
    사용자가 가진 권한은 그 사용자에게 할당된 permission set(권한 집합) 전부의 합집합이므로,
    permission set 중 하나라도 이 permission 을 포함하면 통과합니다.
    """

    def check(
        account: Member = Depends(require_account),
        session: Session = Depends(get_session),
    ) -> Member:
        if permission not in account_permissions(session, account.id):
            raise HTTPException(status_code=403, detail=FORBIDDEN_DETAIL)
        return account

    return check
