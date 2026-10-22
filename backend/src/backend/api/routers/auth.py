import os
from datetime import datetime

from fastapi import APIRouter, Cookie, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.services.auth.pipeline import change_password, delete_account, sign_in, sign_up, update_profile
from backend.services.roster.pipeline import avatar_path, delete_avatar, save_avatar
from backend.services.auth.pipeline import (
    KEEP_TTL,
    SESSION_COOKIE,
    SIGNED_IN_COOKIE,
    revoke_session,
)
from backend.services.auth.pipeline import (
    request_password_reset,
    reset_password,
    send_id_reminder,
)
from backend.services.permission.pipeline import (
    account_permission_set_names,
    account_permissions,
    holds_every_permission,
)
from backend.api.rate_limit import limit_guesses
from backend.services.roster.pipeline import list_my_teams
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
from backend.db.models import Member
from backend.db.pipeline import get_session

router = APIRouter()

# rate limit(같은 요청자가 지정된 시간 안에 보낼 수 있는 요청 횟수 제한)입니다. 횟수는 api/app.py 의 RATE_LIMITS 가 정합니다.
_login_guard = Depends(limit_guesses("login"))
_signup_guard = Depends(limit_guesses("signup"))
_mail_guard = Depends(limit_guesses("mail"))
_reset_guard = Depends(limit_guesses("reset"))

# 로그인 상태 유지를 활성화한 사용자의 cookie(브라우저가 저장해 요청마다 함께 보내는 값) 수명입니다.
# 비활성화한 사용자에게는 수명을 설정하지 않습니다 — 브라우저를 닫을 때 cookie가 삭제됩니다.
# 값은 services/auth/pipeline.py 의 KEEP_TTL 에서 계산합니다.
_KEEP_MAX_AGE = int(KEEP_TTL.total_seconds())


def _cookie_secure() -> bool:
    # 환경변수가 없으면 배포 값(true)입니다. 개발 환경은 HTTP 라 Secure cookie 를 브라우저가 저장하지 않으므로
    # docker-compose.override.yml 이 COOKIE_SECURE=false 로 덮어씁니다.
    return os.environ.get("COOKIE_SECURE", "true").lower() == "true"


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
    permissions = account_permissions(session, member.id)
    return AccountOut(
        id=member.id,
        name=member.name,
        email=member.email or "",
        login_id=member.login_id,
        avatar=member.avatar,
        role="head_manager" if holds_every_permission(permissions) else "member",
        permissions=permissions,  # type: ignore[arg-type]
        permission_sets=account_permission_set_names(session, member.id),
        cohort=member.cohort,
        department=member.department,
    )


@router.post(
    "/signup", response_model=AuthOut, status_code=201, dependencies=[_signup_guard]
)
def signup(
    req: SignupIn, response: Response, session: Session = Depends(get_session)
) -> AuthOut:
    member, token = sign_up(
        session,
        req.name,
        req.department,
        req.student_no,
        req.email,
        req.login_id,
        req.password,
        req.cohort,
        req.admin_code,
        datetime.now(),
    )
    _set_session_cookies(response, token)
    return AuthOut(account=_account_out(session, member))


@router.post("/login", response_model=AuthOut, dependencies=[_login_guard])
def login(
    req: LoginIn, response: Response, session: Session = Depends(get_session)
) -> AuthOut:
    try:
        member, token = sign_in(session, req.login_id, req.password, datetime.now(), req.keep)
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
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


# 프로필 사진입니다. 업로드와 삭제는 본인 사진만 가능하므로 /me 아래에 둡니다.
# 조회는 로그인한 사용자 누구나 계정 번호로 할 수 있습니다. 명단, 검색 화면이 다른 사용자의 사진을 표시합니다.
@router.post("/me/avatar", response_model=AckOut)
def upload_my_avatar(
    file: UploadFile = File(...),
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> AckOut:
    save_avatar(session, requester, file.filename or "", file.file)
    return AckOut()


@router.delete("/me/avatar", status_code=204)
def delete_my_avatar(
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    delete_avatar(session, requester)


@router.get("/members/{member_id}/avatar")
def show_avatar(
    member_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> FileResponse:
    try:
        path, content_type = avatar_path(session, member_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    # 첨부 파일 inline 경로(boards.py 의 view_attachment)와 같은 header 를 추가합니다. 브라우저가 내용을 보고
    # 형식을 재판정하지 못하게 하고, 이 응답이 다른 자원을 불러오지 못하게 합니다.
    return FileResponse(
        path,
        media_type=content_type,
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; frame-ancestors 'self'",
            # 사진을 변경해도 주소가 같아 브라우저가 이전 사진을 표시합니다. 매번 서버에 확인하고,
            # 변경되지 않았으면 FileResponse 가 304 로 응답합니다.
            "Cache-Control": "no-cache",
        },
    )


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
    """사용자를 탈퇴 처리합니다. 그 사람이 작성한 글·댓글·예약도 함께 삭제됩니다.

    포지션은 삭제하지 않고 member_id 만 None 으로 변경합니다. 포지션은 팀의 구성이므로 멤버가
    탈퇴해도 팀의 포지션 수가 줄면 안 됩니다. 삭제 규칙은 db/models.py 의 ondelete 에 정의되어 있습니다.
    """
    delete_account(session, requester)
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
