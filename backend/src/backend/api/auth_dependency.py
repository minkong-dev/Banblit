from collections.abc import Callable
from datetime import datetime

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from backend.services.auth.pipeline import SESSION_COOKIE, resolve_session
from backend.services.permission.pipeline import account_permissions
from backend.contract import Permission
from backend.db.models import Member
from backend.db.pipeline import get_session

# 모든 endpoint(API의 요청 주소 단위)가 현재 요청자를 확인하는 코드를 이 모듈에 모았습니다.
# 라우터는 require_account 를 Depends 로만 추가하고, cookie(브라우저가 저장해 두었다가 요청마다
# 헤더에 함께 보내는 값)를 직접 참조하지 않습니다. 특정 권한이 필요한 endpoint 는
# require_permission("권한 이름") 을 대신 추가합니다.
UNAUTHORIZED_DETAIL = "로그인이 필요해요"


class SessionRejected(Exception):
    """로그인 session 이 없거나 취소, 만료된 요청입니다. api/app.py 가 401 과 SESSION_REJECTED_CODE 로 응답합니다."""


# Cookie(alias=SESSION_COOKIE) 는 요청의 cookie 중 그 이름의 값을 이 매개변수로 전달하고, 없으면 default 입니다.
# Depends(get_session) 은 요청마다 get_session 을 호출한 결과(DB session)를 전달하고 응답 뒤 닫습니다.
def require_account(
    banblit_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    session: Session = Depends(get_session),
) -> Member:
    if banblit_session is None:
        raise SessionRejected

    login_session = resolve_session(session, banblit_session, datetime.now())
    if login_session is None:
        raise SessionRejected

    account = session.get(Member, login_session.member_id)
    # password_hash 가 없는 계정은 명단에만 있고 가입하지 않은 사람(db/models.py 의 Member)이라 로그인 session 을 가질 수 없습니다.
    if account is None or account.password_hash is None:
        raise SessionRejected
    return account


FORBIDDEN_DETAIL = "권한이 없어요"


# Callable[..., Member] 의 ... 은 매개변수를 지정하지 않는다는 뜻입니다. 반환하는 check 의 매개변수는 FastAPI 가 Depends 로 채웁니다.
# 함수 안에서 함수를 만들어 반환하는 이유는 permission 값을 담은 dependency 를 endpoint 마다 1개씩 만들기 위해서입니다.
# FastAPI 는 dependency 에 인자를 넘길 방법이 없어, 인자를 기억하는 함수(closure)를 대신 전달합니다.
def require_permission(permission: Permission) -> Callable[..., Member]:
    """permission(권한)이 설정된 사용자만 통과하게 하는 검증 함수를 반환합니다.

    라우터는 Depends(require_permission("room_edit")) 형식으로 반환된 함수를 추가합니다.
    사용자가 가진 권한은 그 사용자에게 할당된 권한 세트(permission set) 전부의 합집합이므로,
    권한 세트 1개 이상이 이 permission 을 포함하면 통과합니다.
    """

    def check(
        account: Member = Depends(require_account),
        session: Session = Depends(get_session),
    ) -> Member:
        ensure_permission(session, account, permission)
        return account

    return check


def ensure_permission(session: Session, account: Member, permission: Permission) -> None:
    """account 에게 permission 이 없으면 PermissionError 를 발생시킵니다(api/app.py 가 403 으로 응답). 필요한 권한이 요청 내용에 따라 달라 Depends 로 미리 정할 수 없는 endpoint 가 씁니다."""
    if permission not in account_permissions(session, account.id):
        raise PermissionError(FORBIDDEN_DETAIL)
