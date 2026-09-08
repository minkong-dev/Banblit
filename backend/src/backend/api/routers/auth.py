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

# 로그인 상태 유지를 켠 사람의 쿠키 수명. 끈 사람에게는 수명을 아예 싣지 않는다 —
# 그러면 브라우저를 닫을 때 쿠키가 사라진다. 서버 쪽 행의 수명(auth_session)과 같은
# 값이어야 한다. 한쪽만 길면 짧은 쪽이 먼저 끝나 로그인이 풀린다.
_KEEP_MAX_AGE = int(KEEP_TTL.total_seconds())


def _cookie_secure() -> bool:
    # 개발은 http라서 Secure를 켜면 쿠키가 아예 안 붙는다. 배포 base(docker-compose.yml)
    # 에만 COOKIE_SECURE=true를 두고, 개발용 override가 false로 덮는다.
    return os.environ.get("COOKIE_SECURE", "false").lower() == "true"


def _set_session_cookies(response: Response, token: str, keep: bool = False) -> None:
    secure = _cookie_secure()
    # max_age 가 None 이면 브라우저를 닫을 때까지만 남는다.
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
    # 화면이 로그인 여부를 판단하려고 읽는 값이라 httponly가 아니다. 비밀이 아니므로
    # 스크립트가 읽어도 문제없다.
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
    # 화면이 아직 role 로 "헤드매니저"/"일반멤버" 글자를 고른다. 역할 열은 없어졌으므로
    # 항목이 전부 켜졌는지로 그 값을 만들어 내려준다.
    permissions = account_permissions(session, member.id)
    return AccountOut(
        id=member.id,
        name=member.name,
        email=member.email or "",
        role="head_manager" if len(permissions) == len(PERMISSIONS) else "member",
        permissions=permissions,  # type: ignore[arg-type]
        cohort=member.cohort,
    )


@router.post("/signup", response_model=AuthOut, status_code=201)
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


@router.post("/login", response_model=AuthOut)
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
    """탈퇴한다. 그 사람이 남긴 글·댓글·예약도 함께 사라진다(사용자 결정).

    포지션은 남고 비워진다 — 포지션은 팀의 구성이라 사람이 나갔다고 팀에
    구멍이 나면 안 된다. 지우는 규칙은 저장소가 든다(db/models.py 의 ondelete).
    """
    session.delete(requester)
    session.commit()
    _clear_session_cookies(response)


@router.post("/logout")
def logout(
    banblit_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    session: Session = Depends(get_session),
) -> Response:
    # 로그인 상태가 아니어도 200으로 끝낸다 — 이미 로그아웃된 것과 구분할 이유가 없다.
    if banblit_session is not None:
        revoke_session(session, banblit_session, datetime.now())
    response = Response(status_code=200)
    _clear_session_cookies(response)
    return response


@router.post("/find-id", response_model=AckOut)
def find_id(req: FindIdIn, session: Session = Depends(get_session)) -> AckOut:
    # 맞는 계정이 있어도 없어도 같은 답이 나간다. 알려주는 것은 응답이 아니라 메일이다.
    send_id_reminder(session, req.name, req.email)
    return AckOut()


@router.post("/password-reset", response_model=AckOut)
def start_password_reset(
    req: PasswordResetIn, session: Session = Depends(get_session)
) -> AckOut:
    request_password_reset(session, req.email, datetime.now())
    return AckOut()


@router.post("/password-reset/confirm", response_model=AckOut)
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
    # 내가 들어가 있는 포지션을 함께 내려준다. 화면이 "내 팀"을 가려내는 근거가 여기뿐이고,
    # 이미 화면이 로그인 직후 한 번 부르는 endpoint 다.
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
