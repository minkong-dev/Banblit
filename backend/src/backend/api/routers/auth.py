import os
import secrets
from datetime import datetime
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account
from backend.contract import SocialProvider
from backend.services.auth.pipeline import (
    KEEP_TTL,
    SESSION_COOKIE,
    SIGNED_IN_COOKIE,
    SOCIAL_STATE_COOKIE,
    SOCIAL_STATE_TTL,
    change_password,
    delete_account,
    enabled_social_providers,
    link_social,
    linked_providers,
    request_password_reset,
    reset_password,
    resolve_session,
    revoke_session,
    send_id_reminder,
    sign_in,
    sign_in_social,
    SocialError,
    sign_up,
    social_authorize_url,
    social_provider,
    social_user_id,
    unlink_social,
    update_profile,
)
from backend.services.auth.social_login import ProviderConfig
from backend.services.roster.pipeline import avatar_path, delete_avatar, save_avatar
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
    SocialProvidersOut,
)
from backend.db.models import Member
from backend.db.pipeline import get_session

router = APIRouter()

# rate limit(같은 요청자가 지정된 시간 안에 보낼 수 있는 요청 횟수 제한)입니다. 횟수는 api/app.py 의 RATE_LIMITS 가 정합니다.
# Depends(...) 를 변수에 담아 두고 endpoint 의 dependencies=[...] 에 넣습니다. 같은 dependency 를 endpoint 마다 다시 만들지 않습니다.
_login_guard = Depends(limit_guesses("login"))
_signup_guard = Depends(limit_guesses("signup"))
_mail_guard = Depends(limit_guesses("mail"))
_reset_guard = Depends(limit_guesses("reset"))
_social_guard = Depends(limit_guesses("social"))

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
        # httponly 는 JavaScript 의 document.cookie 로 이 값을 읽지 못하게 막고, samesite=lax 는 다른 사이트에서 시작한
        # POST 요청에 이 cookie 를 붙이지 않게 막습니다(CSRF 방지).
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
        # account_permissions 는 DB 의 text 값이라 list[str] 이고 AccountOut 은 list[Permission](Literal) 을 요구합니다.
        # 값은 DB CHECK 제약이 PERMISSIONS 로 제한하므로 mypy 의 타입 불일치 경고만 무시합니다.
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
    # app.py 의 ValueError handler 는 422 로 응답합니다. 로그인 실패는 입력 형식이 아니라 인증 실패이므로 여기서 401 로 바꿉니다.
    # now 를 sign_in 안에서 구하지 않고 인자로 전달하는 이유는 테스트가 시각을 지정해 만료를 재현하기 위해서입니다. 다른 service 함수도 같습니다.
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
    file: UploadFile = File(),
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
    # LookupError 는 services/roster/avatar_service.py 의 avatar_path 가 사진이 없을 때 발생시킵니다.
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
            # default-src 'none' 은 이 응답 안에서 어떤 자원(script, style, font)도 불러오지 못하게 하고, img-src 'self' 는 같은 출처의
            # 그림만 허용하며, frame-ancestors 'self' 는 다른 사이트가 이 응답을 iframe 으로 넣지 못하게 합니다.
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
        change_password(session, requester, req.current, req.new_password)
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
        linked_social=linked_providers(session, requester.id),
    )


# ── 소셜 로그인 ─────────────────────────────────────────────────────────────
# 시작 endpoint 가 state(무작위 문자열)를 cookie 에 두고 제공자로 보냅니다. callback 은 돌아온 state 가 cookie 와 같을 때만
# code 를 사용자 번호로 바꿉니다. cookie 는 1개라 탭 2개에서 동시에 시작하면 먼저 시작한 탭의 callback 이 실패합니다. 로그인 session 이 있으면 그 계정에 연결하고(프로필의 "연결"), 없으면 연결된 계정으로
# 로그인합니다(로그인 화면의 버튼). 결과는 화면 주소로 redirect 하고 사유는 social query 로 전달합니다.


def _provider_or_404(provider: SocialProvider) -> ProviderConfig:
    config = social_provider(provider)
    if config is None:
        raise HTTPException(status_code=404, detail="사용할 수 없는 소셜 로그인 제공자예요")
    return config


def _set_state_cookie(response: Response, state: str) -> None:
    response.set_cookie(
        SOCIAL_STATE_COOKIE,
        state,
        httponly=True,
        samesite="lax",
        path="/",
        max_age=int(SOCIAL_STATE_TTL.total_seconds()),
        secure=_cookie_secure(),
    )


def _signed_in_member(session: Session, token: str | None) -> Member | None:
    # callback 에서 로그인 여부로 연결과 로그인을 구분합니다. require_account 는 없으면 401 을 발생시키므로 쓰지 않습니다.
    if token is None:
        return None
    login_session = resolve_session(session, token, datetime.now())
    return None if login_session is None else session.get(Member, login_session.member_id)


@router.get("/social", response_model=SocialProvidersOut)
def list_social_providers() -> SocialProvidersOut:
    return SocialProvidersOut(providers=enabled_social_providers())


@router.get("/social/{provider}/start", status_code=302)
def start_social(provider: SocialProvider) -> RedirectResponse:
    config = _provider_or_404(provider)
    # state 앞에 제공자 이름을 붙입니다. callback 이 제공자까지 비교해 google 용 state 가 kakao callback 에 쓰이지 않게 합니다.
    state = f"{provider}.{secrets.token_urlsafe(32)}"
    response = RedirectResponse(social_authorize_url(config, state), status_code=302)
    _set_state_cookie(response, state)
    return response


@router.get("/social/{provider}/callback", status_code=302, dependencies=[_social_guard])
def finish_social(
    provider: SocialProvider,
    # 제공자가 돌려주는 값입니다. 사용자가 거절하면 code 없이 error 만 옵니다. 길이 상한은 제공자로 그대로 전달되는 값을 제한합니다.
    code: str = Query(default="", max_length=2048),
    state: str = Query(default="", max_length=2048),
    session: Session = Depends(get_session),
    banblit_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    banblit_social_state: str | None = Cookie(default=None, alias=SOCIAL_STATE_COOKIE),
) -> RedirectResponse:
    config = _provider_or_404(provider)
    member = _signed_in_member(session, banblit_session)
    # 연결 시도는 프로필로, 로그인 시도는 로그인 화면으로 돌아갑니다. 사유는 social query 에 담고 화면이 문구로 바꿉니다.
    back = "/profile" if member is not None else "/login"
    # secrets.compare_digest 는 두 값을 길이와 무관하게 같은 시간에 비교합니다. 일반 == 비교는 앞부분이 다르면 일찍 끝나
    # 그 시간 차이로 값을 추측할 수 있습니다. str 은 ASCII 가 아닌 글자가 섞이면 TypeError 라 bytes 로 비교합니다.
    if (
        code == ""
        or banblit_social_state is None
        or not state.startswith(f"{provider}.")
        or not secrets.compare_digest(state.encode("utf-8"), banblit_social_state.encode("utf-8"))
    ):
        return _social_result(back, "failed")
    try:
        provider_user_id = social_user_id(config, code)
        if member is not None:
            link_social(session, member.id, provider, provider_user_id, datetime.now())
            return _social_result(back, "linked")
        _, token = sign_in_social(session, provider, provider_user_id, datetime.now())
    except SocialError as error:
        # 문장이 아니라 code 만 주소에 붙입니다. 문장을 붙이면 아무 문장이나 담은 링크가 앱의 toast 로 표시됩니다.
        return _social_result(back, "failed", error.code)
    response = _social_result("/scheduler", "signed_in")
    _set_session_cookies(response, token)
    return response


def _social_result(path: str, result: str, detail: str = "") -> RedirectResponse:
    """화면 주소로 보내는 redirect 응답입니다. state cookie 는 1회용이라 결과와 무관하게 삭제합니다. detail 은 SocialError 의 code 입니다."""
    query = {"social": result}
    if detail != "":
        query["detail"] = detail
    response = RedirectResponse(f"{path}?{urlencode(query)}", status_code=302)
    response.delete_cookie(SOCIAL_STATE_COOKIE, path="/", httponly=True, samesite="lax", secure=_cookie_secure())
    return response


@router.delete("/me/social/{provider}", status_code=204)
def unlink_my_social(
    provider: SocialProvider,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> Response:
    # 비밀번호 로그인이 항상 남아 있으므로 마지막 연결을 해제해도 계정이 잠기지 않습니다.
    unlink_social(session, requester.id, provider)
    return Response(status_code=204)
