# auth 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api, jobs, scripts 와 다른 service 모듈은 이 모듈 안의 다른 파일을 직접 import 하지 않고
# 이 파일만 참조합니다. 로그인 유지 기간처럼 운영자가 조절하는 값은 이 파일에만 둡니다.

import os
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.db.models import Member
from backend.services.auth import auth_session, password_reset
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

# 로그인 상태 유지를 끈 사람의 session(로그인 상태를 담는 서버 쪽 기록) 유효 기간입니다.
# 브라우저를 닫으면 cookie 가 삭제되므로 브라우저를 계속 켜 둔 사람에게만 적용됩니다.
SESSION_TTL = timedelta(days=7)
# 로그인 상태 유지를 켠 사람의 session 유효 기간입니다. cookie 에도 같은 값을 씁니다. 한쪽만 길면 짧은 쪽이 먼저 만료됩니다.
KEEP_TTL = timedelta(days=90)
SESSION_COOKIE = "banblit_session"
SIGNED_IN_COOKIE = "banblit_signed_in"
# 재설정 token 은 그것만으로 계정을 탈취할 수 있어 SESSION_TTL 보다 짧게 둡니다. 메일을 열어 새 비밀번호를 설정하는 시간입니다.
RESET_TTL = timedelta(minutes=30)
# 같은 계정으로 이 시간 안에 다시 요청하면 token 을 만들지 않고 메일도 보내지 않습니다. 인증 없이 열린 endpoint 라
# 제한하지 않으면 다른 사람의 메일함에 재설정 메일을 계속 보낼 수 있습니다.
RESEND_INTERVAL = timedelta(minutes=1)


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
    """계정을 만들고 바로 로그인한 session token 을 함께 반환합니다."""
    # 계정 생성이 commit 된 뒤에 session 을 만듭니다. session 행이 member 번호를 외래 키로 참조합니다.
    member = signup(session, name, department, student_no, email, login_id, password, cohort, admin_code)
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
    "KEEP_TTL",
    "RESEND_INTERVAL",
    "RESET_TTL",
    "SESSION_COOKIE",
    "SESSION_TTL",
    "SIGNED_IN_COOKIE",
]
