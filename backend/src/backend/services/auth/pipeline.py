# auth 모듈의 시퀀스 파일(모듈 안 함수의 호출 순서와 조절 값을 모아 두는 파일)이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api, jobs, 저장소 루트의 scripts/(seed_load.py 등 운영 script)와 다른 service 모듈은 이 모듈 안의 다른 파일을
# 직접 import 하지 않고 이 파일만 참조합니다. 로그인 유지 기간처럼 운영자가 조절하는 값은 이 파일에만 둡니다.

import os
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.contract import SOCIAL_PROVIDERS, SocialProvider
from backend.db.models import Member
from backend.services.auth import auth_session, password_reset, social_login
from backend.services.auth.auth_service import (
    change_password,
    delete_account,
    hash_password,
    login,
    signup,
    update_profile,
)
from backend.services.auth.auth_session import resolve_session, revoke_session
from backend.services.auth.password_reset import reset_password, send_id_reminder
from backend.services.auth.social_login import ProviderConfig, SocialError, linked_providers, unlink_social

# 로그인 상태 유지를 끈 사람의 session(로그인 상태를 담는 서버 쪽 기록) 유효 기간입니다.
# 브라우저를 닫으면 cookie 가 삭제되므로 브라우저를 계속 켜 둔 사람에게만 적용됩니다.
SESSION_TTL = timedelta(days=7)
# 로그인 상태 유지를 켠 사람의 session 유효 기간입니다. cookie 에도 같은 값을 씁니다. 한쪽만 길면 짧은 쪽이 먼저 만료됩니다.
KEEP_TTL = timedelta(days=90)
SESSION_COOKIE = "banblit_session"
# 관리자코드를 담은 환경변수의 이름입니다. 값은 개발자가 결정하고 .env 에 둡니다(저장소에 넣지 않습니다).
ADMIN_CODE_VARIABLE = "ADMIN_SIGNUP_CODE"
SIGNED_IN_COOKIE = "banblit_signed_in"
# 재설정 token 은 그것만으로 계정을 탈취할 수 있어 SESSION_TTL 보다 짧게 둡니다. 메일을 열어 새 비밀번호를 설정하는 시간입니다.
RESET_TTL = timedelta(minutes=30)
# 같은 계정으로 이 시간 안에 다시 요청하면 token 을 만들지 않고 메일도 보내지 않습니다. 인증 없이 열린 endpoint 라
# 제한하지 않으면 다른 사람의 메일함에 재설정 메일을 계속 보낼 수 있습니다.
RESEND_INTERVAL = timedelta(minutes=1)
# 소셜 로그인 제공자(Google, 카카오)에 token 교환과 사용자 조회를 요청할 때의 timeout(초)입니다.
SOCIAL_HTTP_TIMEOUT = 10.0
# 소셜 로그인 시작부터 callback 까지 state cookie 가 유효한 시간입니다. 제공자 화면에서 로그인을 마치는 시간입니다.
SOCIAL_STATE_TTL = timedelta(minutes=10)
SOCIAL_STATE_COOKIE = "banblit_social_state"


def create_session(session: Session, member_id: int, now: datetime, keep: bool = False) -> str:
    # 로그인 상태 유지 여부로 유효 기간을 고릅니다. cookie 의 만료(api/routers/auth.py)도 같은 KEEP_TTL 을 씁니다.
    return auth_session.create_session(session, member_id, now, KEEP_TTL if keep else SESSION_TTL)


def sign_up(
    session: Session,
    name: str,
    department: str,
    student_no: str,
    email: str,
    login_id: str,
    password: str,
    cohort: int,
    admin_code: str | None,
    now: datetime,
) -> tuple[Member, str]:
    """계정을 만들고 바로 로그인한 session token 을 함께 반환합니다.

    auth_service.signup 은 계정 행만 만들고, 이 함수는 그 위에 session 까지 만듭니다. API 의 가입은 이 함수를,
    script 로 계정만 만들 때는 signup 을 씁니다.
    """
    # 관리자코드는 배포마다 다른 값이라 환경변수로 받습니다. 비어 있으면 signup 이 어떤 코드도 통과시키지 않습니다.
    expected_code = os.environ.get(ADMIN_CODE_VARIABLE, "")
    # 계정 생성이 commit 된 뒤에 session 을 만듭니다. session 행이 member 번호를 외래 키로 참조합니다.
    member = signup(session, name, department, student_no, email, login_id, password, cohort, admin_code, expected_code)
    return member, create_session(session, member.id, now)


def sign_in(session: Session, login_id: str, password: str, now: datetime, keep: bool) -> tuple[Member, str]:
    """아이디와 비밀번호를 확인하고 session token 을 함께 반환합니다. 틀리면 ValueError 를 발생시킵니다."""
    # 비밀번호 확인을 통과한 뒤에만 session 을 만듭니다. 틀린 요청은 sessions table 에 행을 남기지 않습니다.
    member = login(session, login_id, password)
    return member, create_session(session, member.id, now, keep)


def issue_reset_token(session: Session, member_id: int, now: datetime) -> str | None:
    return password_reset.issue_reset_token(session, member_id, now, RESET_TTL, RESEND_INTERVAL)


def request_password_reset(session: Session, email: str, now: datetime) -> None:
    # APP_ORIGIN 은 배포마다 다른 사이트 주소라 환경변수로 받습니다. 비어 있으면 password_reset 이 발송하지 않고 오류를 남깁니다.
    password_reset.request_password_reset(
        session, email, now, RESET_TTL, RESEND_INTERVAL, os.environ.get("APP_ORIGIN", "")
    )


def social_provider(name: SocialProvider) -> ProviderConfig | None:
    """name 제공자의 설정을 반환합니다. 환경변수 <NAME>_CLIENT_ID, <NAME>_CLIENT_SECRET 과 APP_ORIGIN 중 하나라도 비어 있으면
    None 입니다. None 이면 화면이 그 제공자의 버튼을 표시하지 않고, endpoint 는 404 로 응답합니다."""
    if os.environ.get("APP_ORIGIN", "") == "":
        return None
    prefix = name.upper()
    return social_login.provider_config(
        name, os.environ.get(f"{prefix}_CLIENT_ID", ""), os.environ.get(f"{prefix}_CLIENT_SECRET", "")
    )


def enabled_social_providers() -> list[SocialProvider]:
    return [name for name in SOCIAL_PROVIDERS if social_provider(name) is not None]


def social_redirect_uri(name: SocialProvider) -> str:
    """제공자에 등록한 callback 주소입니다. 화면 주소 뒤에 /api 를 붙입니다(nginx, vite 가 /api 를 삭제해 api 로 전달합니다)."""
    return f"{os.environ.get('APP_ORIGIN', '').rstrip('/')}/api/social/{name}/callback"


def social_authorize_url(config: ProviderConfig, state: str) -> str:
    return social_login.authorize_url(config, social_redirect_uri(config.name), state)


def social_user_id(config: ProviderConfig, code: str) -> str:
    """callback 의 code 를 제공자의 사용자 번호로 바꿉니다. 제공자가 응답하지 않거나 거절하면 SocialError(provider) 입니다."""
    return social_login.fetch_provider_user_id(config, code, social_redirect_uri(config.name), SOCIAL_HTTP_TIMEOUT)


def link_social(session: Session, member_id: int, provider: SocialProvider, provider_user_id: str, now: datetime) -> None:
    social_login.link(session, member_id, provider, provider_user_id, now)


def sign_in_social(session: Session, provider: SocialProvider, provider_user_id: str, now: datetime) -> tuple[Member, str]:
    """provider_user_id 에 연결된 멤버로 로그인하고 session token 을 함께 반환합니다. 연결이 없으면 SocialError(unlinked) 입니다."""
    member = social_login.find_member(session, provider, provider_user_id)
    if member is None:
        raise SocialError("unlinked", "연결된 계정이 존재하지 않아요. 가입 후 프로필에서 연결해주세요.")
    # 소셜 로그인은 "로그인 상태 유지" 를 선택할 자리가 없어 유지하지 않는 쪽(SESSION_TTL)으로 둡니다.
    return member, create_session(session, member.id, now)


__all__ = [
    "change_password",
    "create_session",
    "delete_account",
    "hash_password",
    "issue_reset_token",
    "login",
    "request_password_reset",
    "reset_password",
    "resolve_session",
    "revoke_session",
    "send_id_reminder",
    "sign_in",
    "sign_up",
    "signup",
    "update_profile",
    "enabled_social_providers",
    "link_social",
    "linked_providers",
    "sign_in_social",
    "SocialError",
    "social_authorize_url",
    "social_provider",
    "social_user_id",
    "unlink_social",
    "KEEP_TTL",
    "RESEND_INTERVAL",
    "RESET_TTL",
    "SESSION_COOKIE",
    "SESSION_TTL",
    "SIGNED_IN_COOKIE",
    "SOCIAL_HTTP_TIMEOUT",
    "SOCIAL_STATE_COOKIE",
    "SOCIAL_STATE_TTL",
]
