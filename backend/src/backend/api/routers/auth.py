import os
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.api.auth_service import list_account_positions
from backend.api.auth_service import login as login_account
from backend.api.auth_service import signup as signup_account
from backend.api.auth_session import (
    SESSION_COOKIE,
    SESSION_TTL,
    SIGNED_IN_COOKIE,
    create_session,
    revoke_session,
)
from backend.api.schemas import AccountOut, AuthOut, LoginIn, MeOut, SignupIn
from backend.db.models import Member
from backend.db.pipeline import get_session

router = APIRouter()

_COOKIE_MAX_AGE = int(SESSION_TTL.total_seconds())


def _cookie_secure() -> bool:
    # 개발은 http라서 Secure를 켜면 쿠키가 아예 안 붙는다. 배포 base(docker-compose.yml)
    # 에만 COOKIE_SECURE=true를 두고, 개발용 override가 false로 덮는다.
    return os.environ.get("COOKIE_SECURE", "false").lower() == "true"


def _set_session_cookies(response: Response, token: str) -> None:
    secure = _cookie_secure()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=_COOKIE_MAX_AGE,
        secure=secure,
    )
    # 화면이 로그인 여부를 판단하려고 읽는 값이라 httponly가 아니다. 비밀이 아니므로
    # 스크립트가 읽어도 문제없다.
    response.set_cookie(
        SIGNED_IN_COOKIE,
        "1",
        httponly=False,
        samesite="lax",
        path="/",
        max_age=_COOKIE_MAX_AGE,
        secure=secure,
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(SIGNED_IN_COOKIE, path="/")


def _account_out(session: Session, member: Member) -> AccountOut:
    return AccountOut(
        id=member.id,
        name=member.name,
        email=member.email or "",
        role=member.role,  # type: ignore[arg-type]
        positions=list_account_positions(session, member.id),
    )


@router.post("/signup", response_model=AuthOut, status_code=201)
def signup(
    req: SignupIn, response: Response, session: Session = Depends(get_session)
) -> AuthOut:
    try:
        member = signup_account(session, req.name, req.email, req.password, req.positions)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    token = create_session(session, member.id, datetime.now())
    _set_session_cookies(response, token)
    return AuthOut(account=_account_out(session, member))


@router.post("/login", response_model=AuthOut)
def login(
    req: LoginIn, response: Response, session: Session = Depends(get_session)
) -> AuthOut:
    try:
        member = login_account(session, req.email, req.password)
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    token = create_session(session, member.id, datetime.now())
    _set_session_cookies(response, token)
    return AuthOut(account=_account_out(session, member))


@router.post("/logout")
def logout(
    banblit_session: str | None = Cookie(default=None),
    session: Session = Depends(get_session),
) -> Response:
    # 로그인 상태가 아니어도 200으로 끝낸다 — 이미 로그아웃된 것과 구분할 이유가 없다.
    if banblit_session is not None:
        revoke_session(session, banblit_session, datetime.now())
    response = Response(status_code=200)
    _clear_session_cookies(response)
    return response


@router.get("/me", response_model=MeOut)
def read_me(
    requester: Member = Depends(require_account), session: Session = Depends(get_session)
) -> MeOut:
    return MeOut(account=_account_out(session, requester))
