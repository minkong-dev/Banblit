import os
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.api.auth_service import change_password, update_profile
from backend.api.auth_service import login as login_account
from backend.api.auth_service import signup as signup_account
from backend.api.auth_session import (
    KEEP_TTL,
    SESSION_COOKIE,
    SIGNED_IN_COOKIE,
    create_session,
    revoke_session,
)
from backend.api.password_reset import (
    request_password_reset,
    reset_password,
    send_id_reminder,
)
from backend.api.permission_service import account_permissions
from backend.api.rate_limit import limit_guesses
from backend.api.roster_service import list_my_teams
from backend.api.schemas import (
    AccountOut,
    AckOut,
    AuthOut,
    FindIdIn,
    LoginIn,
    PasswordChangeIn,
    ProfileEditIn,
    MeOut,
    MyTeamOut,
    PasswordResetConfirmIn,
    PasswordResetIn,
    SignupIn,
)
from backend.db.models import PERMISSIONS, Member
from backend.db.pipeline import get_session

router = APIRouter()

# rate limit(같은 요청자가 정해진 시간 안에 보낼 수 있는 요청 횟수 제한)을 설정합니다. 비밀번호를
# 하나씩 시도하는 것을 막지 못하면 짧은 비밀번호는 시도 횟수만 충분하면 맞힐 수 있습니다. 메일을
# 전송하는 endpoint(API의 요청 주소 단위)는 상한을 더 낮게 설정합니다. 다른 사람의 주소로 메일을
# 대량 발송하는 데 악용될 수 있기 때문입니다.
_login_guard = Depends(limit_guesses(limit=10, window_seconds=300))
_signup_guard = Depends(limit_guesses(limit=5, window_seconds=3600))
_mail_guard = Depends(limit_guesses(limit=5, window_seconds=3600))
_reset_guard = Depends(limit_guesses(limit=10, window_seconds=3600))

# 로그인 상태 유지를 활성화한 사용자의 cookie(브라우저가 저장해 요청마다 함께 보내는 값) 수명입니다.
# 비활성화한 사용자에게는 수명을 설정하지 않습니다 — 브라우저를 닫을 때 cookie가 삭제됩니다.
# 서버 쪽 session(auth_session 모듈)과 같은 값이어야 합니다. 한쪽만 길면 짧은 쪽이 먼저 만료되어
# 로그인이 해제됩니다.
_KEEP_MAX_AGE = int(KEEP_TTL.total_seconds())


def _cookie_secure() -> bool:
    # 개발 환경은 HTTP 이므로 Secure 플래그를 활성화하면 브라우저가 cookie 를 저장하지 않습니다.
    # docker-compose.yml 의 배포 기본값에만 COOKIE_SECURE=true 를 설정하고, 개발 환경 override 파일은 false 로 재설정합니다.
    return os.environ.get("COOKIE_SECURE", "false").lower() == "true"


def _set_session_cookies(response: Response, token: str, keep: bool = False) -> None:
    secure = _cookie_secure()
    # max_age가 None이면 cookie는 브라우저를 닫을 때까지만 유지됩니다.
    max_age = _KEEP_MAX_AGE if keep else None
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=max_age,
        secure=secure,
    )
    # 화면이 로그인 여부를 판단하려고 읽는 값이므로 httponly=False입니다. 비밀이 아니므로
    # JavaScript가 읽어도 문제없습니다.
    response.set_cookie(
        SIGNED_IN_COOKIE,
        "1",
        httponly=False,
        samesite="lax",
        path="/",
        max_age=max_age,
        secure=secure,
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(SIGNED_IN_COOKIE, path="/")


def _account_out(session: Session, member: Member) -> AccountOut:
    # 화면이 role 을 "헤드매니저"/"일반멤버"로 구분합니다. role 을 저장하는 열은 없으므로,
    # PERMISSIONS 의 항목을 모두 가졌는지로 값을 결정합니다.
    permissions = account_permissions(session, member.id)
    return AccountOut(
        id=member.id,
        name=member.name,
        email=member.email or "",
        role="head_manager" if len(permissions) == len(PERMISSIONS) else "member",
        permissions=permissions,  # type: ignore[arg-type]
        cohort=member.cohort,
    )


@router.post(
    "/signup", response_model=AuthOut, status_code=201, dependencies=[_signup_guard]
)
def signup(
    req: SignupIn, response: Response, session: Session = Depends(get_session)
) -> AuthOut:
    member = signup_account(
        session,
        req.name,
        req.department,
        req.student_no,
        req.email,
        req.password,
        req.cohort,
    )
    token = create_session(session, member.id, datetime.now())
    _set_session_cookies(response, token)
    return AuthOut(account=_account_out(session, member))


@router.post("/login", response_model=AuthOut, dependencies=[_login_guard])
def login(
    req: LoginIn, response: Response, session: Session = Depends(get_session)
) -> AuthOut:
    try:
        member = login_account(session, req.email, req.password)
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    token = create_session(session, member.id, datetime.now(), keep=req.keep)
    _set_session_cookies(response, token, keep=req.keep)
    return AuthOut(account=_account_out(session, member))


@router.patch("/me", response_model=AuthOut)
def edit_me(
    req: ProfileEditIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> AuthOut:
    member = update_profile(session, requester, req.name, req.cohort)
    return AuthOut(account=_account_out(session, member))


@router.post("/me/password", status_code=204)
def edit_my_password(
    req: PasswordChangeIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    try:
        change_password(session, requester, req.current, req.next)
    except PermissionError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/me", status_code=204)
def leave(
    response: Response,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    """사용자를 탈퇴 처리합니다. 그 사람이 작성한 글·댓글·예약도 함께 삭제됩니다(사용자 결정).

    포지션은 삭제하지 않고 member_id 만 None 으로 비웁니다. 포지션은 팀의 구성이므로 멤버가
    탈퇴해도 팀의 포지션 수가 줄면 안 됩니다. 삭제 규칙은 db/models.py 의 ondelete 에 정의되어 있습니다.
    """
    session.delete(requester)
    session.commit()
    _clear_session_cookies(response)


@router.post("/logout")
def logout(
    banblit_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    session: Session = Depends(get_session),
) -> Response:
    # 로그인 상태가 아니어도 200 으로 반환합니다. 이미 로그아웃된 요청과 구분할 필요가 없습니다.
    if banblit_session is not None:
        revoke_session(session, banblit_session, datetime.now())
    response = Response(status_code=200)
    _clear_session_cookies(response)
    return response


@router.post("/find-id", response_model=AckOut, dependencies=[_mail_guard])
def find_id(req: FindIdIn, session: Session = Depends(get_session)) -> AckOut:
    # 일치하는 계정이 있어도 없어도 같은 응답을 반환합니다. 결과를 알려주는 수단은 응답이 아니라 메일입니다.
    send_id_reminder(session, req.name, req.email)
    return AckOut()


@router.post("/password-reset", response_model=AckOut, dependencies=[_mail_guard])
def start_password_reset(
    req: PasswordResetIn, session: Session = Depends(get_session)
) -> AckOut:
    request_password_reset(session, req.email, datetime.now())
    return AckOut()


@router.post(
    "/password-reset/confirm", response_model=AckOut, dependencies=[_reset_guard]
)
def confirm_password_reset(
    req: PasswordResetConfirmIn, session: Session = Depends(get_session)
) -> AckOut:
    try:
        reset_password(session, req.token, req.password, datetime.now())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return AckOut()


@router.get("/me", response_model=MeOut)
def read_me(
    requester: Member = Depends(require_account), session: Session = Depends(get_session)
) -> MeOut:
    # 사용자가 속한 포지션도 함께 반환합니다. 화면이 "내 팀"을 구분하는 근거가 이 응답뿐이고,
    # 화면이 로그인 직후 한 번 호출하는 endpoint(API의 요청 주소 단위)입니다.
    return MeOut(
        account=_account_out(session, requester),
        teams=[
            MyTeamOut(
                team_id=team.id,
                team_name=team.name,
                instrument=slot.instrument,
                ordinal=slot.ordinal,
            )
            for team, slot in list_my_teams(session, requester.id)
        ],
    )
