import os
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from backend.services.input import require_password
from backend.services.auth_service import hash_password
from backend.services.auth_session import hash_token, revoke_member_sessions
from backend.services.mailer import send_mail
from backend.db.models import Member, PasswordResetToken

# session 유효 기간(SESSION_TTL, 7일)보다 짧게 설정합니다. 이 token 하나만으로 계정을 탈취할 수 있고,
# 만료 전까지 메일함에 남아 있기 때문입니다. 메일을 수신하고 열어 새 비밀번호를 설정하는 데 필요한
# 시간만 있으면 되므로 30분으로 설정합니다.
RESET_TTL = timedelta(minutes=30)

# 같은 계정으로 이 시간 내에 다시 호출하면 token을 생성하지도, 메일을 전송하지도 않습니다.
# 이 endpoint 는 인증 없이 열려 있어서 누구든 반복 호출할 수 있습니다. 제한하지 않으면 다른 사용자의
# 메일함에 재설정 link 를 계속 보낼 수 있고, 유효한 token 도 그만큼 증가합니다.
RESEND_INTERVAL = timedelta(minutes=1)

# 메일에 포함할 재설정 link의 기본 도메인입니다. 배포 환경의 도메인은 환경변수로 지정합니다.
DEFAULT_APP_ORIGIN = "http://localhost:5173"

RESET_SUBJECT = "[Banblit] 비밀번호 재설정"
FIND_ID_SUBJECT = "[Banblit] 아이디 안내"
BAD_TOKEN = "재설정 링크가 만료되었거나 이미 사용되었습니다"


def _find_account(session: Session, email: str) -> Member | None:
    # password_hash가 없는 멤버는 명단에만 등록되어 있고 가입 절차를 완료하지 않았습니다 — 변경할 비밀번호도,
    # 안내할 아이디도 없습니다.
    return session.scalar(
        select(Member).where(
            Member.email == email.strip(), Member.password_hash.is_not(None)
        )
    )


def _reset_link(token: str) -> str:
    # 값이 없을 때와 빈 문자열로 들어올 때를 같이 처리합니다 — 환경 설정 파일이 설정하지 못한 환경변수는
    # 삭제되지 않고 빈 문자열로 설정됩니다.
    origin = (os.environ.get("APP_ORIGIN") or DEFAULT_APP_ORIGIN).rstrip("/")
    return f"{origin}/reset-password?token={token}"


def issue_reset_token(session: Session, member_id: int, now: datetime) -> str | None:
    """새 재설정 token을 생성하여 원문을 반환합니다. 반복 요청일 경우 생성하지 않고 None을 반환합니다.

    이전 token은 삭제합니다 — 한 계정에 유효한 token은 항상 하나뿐입니다.
    """
    # ponytail: 조회와 저장 사이에 lock이 없습니다. 같은 계정으로 거의 동시에 들어오는 두
    # 요청이 둘 다 이 검증을 통과할 수 있고, 그러면 메일이 2통 전송됩니다. auth_service.signup 도
    # 같은 구조입니다. 메일이 2통 전송되는 것이 문제가 되면 이 행을 lock 하고(FOR UPDATE)
    # 검증합니다.
    latest = session.scalar(
        select(PasswordResetToken.created_at)
        .where(PasswordResetToken.member_id == member_id)
        .order_by(PasswordResetToken.created_at.desc())
    )
    if latest is not None and now - latest < RESEND_INTERVAL:
        return None

    session.execute(
        delete(PasswordResetToken).where(PasswordResetToken.member_id == member_id)
    )
    token = secrets.token_urlsafe(32)
    session.add(
        PasswordResetToken(
            token_hash=hash_token(token),
            member_id=member_id,
            expires_at=now + RESET_TTL,
            created_at=now,
        )
    )
    session.commit()
    return token


def _consume_token(session: Session, token: str, now: datetime) -> int | None:
    """아직 사용되지 않고 만료되지 않은 token에 사용 표시를 남기고, 해당 계정 번호를 반환합니다.

    조회와 업데이트를 한 문장(UPDATE ... RETURNING)으로 수행합니다 — 읽은 후 쓰면 같은 token을
    동시에 제시하는 두 요청이 둘 다 통과할 수 있기 때문입니다.
    """
    return session.scalar(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.token_hash == hash_token(token),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at >= now,
        )
        .values(used_at=now)
        .returning(PasswordResetToken.member_id)
        .execution_options(synchronize_session=False)
    )


def request_password_reset(session: Session, email: str, now: datetime) -> None:
    """해당 이메일로 가입한 계정이 있으면 재설정 link를 전송합니다. 없으면 아무것도 수행하지 않습니다.

    있든 없든 호출자는 동일한 응답을 받습니다 — 다르게 응답하면 그 이메일이 가입되어 있는지를
    드러내는 결과가 됩니다.

    ponytail: 제한은 계정 단위로만 설정합니다. 서로 다른 계정을 번갈아 호출하면 그만큼 메일이
    전송됩니다. 요청자 단위로 제한하려면 요청자의 IP 주소별로 호출 횟수를 추적해야 하는데, 그 기능은
    reverse proxy(gateway)에 구현합니다.
    """
    member = _find_account(session, email)
    if member is None or member.email is None:
        return
    token = issue_reset_token(session, member.id, now)
    if token is None:
        return
    send_mail(
        member.email,
        RESET_SUBJECT,
        f"{member.name}님, 아래 주소에서 새 비밀번호를 설정해 주세요.\n\n"
        f"{_reset_link(token)}\n\n"
        f"이 링크는 {int(RESET_TTL.total_seconds() // 60)}분 뒤에 만료되고 한 번만 쓸 수 "
        "있습니다. 요청한 적이 없다면 이 메일을 버리셔도 됩니다.",
    )


def reset_password(session: Session, token: str, password: str, now: datetime) -> None:
    """token을 한 번 사용하여 비밀번호를 변경합니다. 사용 불가능한 token이면 ValueError를 발생시킵니다."""
    # 비밀번호를 먼저 검증합니다. 이후에 검증하면 규칙을 위반하는 값으로 인해 token이 소비되어,
    # 사용자가 메일을 다시 요청해야 합니다.
    require_password(password)
    member_id = _consume_token(session, token, now)
    if member_id is None:
        raise ValueError(BAD_TOKEN)
    member = session.get(Member, member_id)
    if member is None:
        raise ValueError(BAD_TOKEN)
    member.password_hash = hash_password(password)
    # 비밀번호를 변경하면 해당 계정의 활성 로그인 세션을 모두 종료합니다 — 종료하지 않으면 다른 기기에서
    # 열려 있는 세션이 새 비밀번호와 무관하게 유효하게 유지됩니다.
    revoke_member_sessions(session, member_id, now)
    session.commit()


def send_id_reminder(session: Session, name: str, email: str) -> None:
    """이름과 이메일이 모두 일치하는 계정이 있을 때만 그 이메일로 로그인 아이디를 안내합니다.

    아이디는 이메일과 별도로 가입할 때 정한 login_id 입니다. 이메일은 계정을 찾는 열쇠이자
    메일을 받을 주소일 뿐이고, 화면에는 보여주지 않습니다 — 메일함 소유자만 접근할 수 있는
    곳으로 전송하면 정보 노출이 없습니다.

    ponytail: 반복 호출을 제한하지 않았습니다. 이름과 이메일을 모두 맞혀야 메일이 전송되고
    그 메일은 해당 이메일로만 전송됩니다. 같은 주소로 대량 전송이 문제가 되면
    issue_reset_token이 하듯이 마지막 전송 시각을 기록하여 간격을 설정하면 됩니다.
    """
    member = _find_account(session, email)
    if member is None or member.email is None or member.name != name.strip():
        return
    send_mail(
        member.email,
        FIND_ID_SUBJECT,
        f"{member.name}님, 이 아이디가 Banblit 로그인 아이디입니다.\n\n"
        f"{member.login_id}\n\n"
        "요청한 적이 없다면 이 메일을 버리셔도 됩니다.",
    )
