import os
import secrets
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from backend.api.auth_input import require_password
from backend.api.auth_service import hash_password
from backend.api.auth_session import hash_token, revoke_member_sessions
from backend.api.mailer import send_mail
from backend.db.models import Member, PasswordResetToken

# 세션(7일)보다 훨씬 짧게 둔다. 이 토큰 하나면 계정을 통째로 가져갈 수 있는데, 그동안
# 메일함에 그대로 남아 있다. 메일이 도착해 사람이 열어 보고 새 비밀번호를 정하는 데
# 드는 시간만 덮으면 되므로 30분으로 잡는다.
RESET_TTL = timedelta(minutes=30)

# 같은 계정으로 이 시간 안에 다시 부르면 토큰을 새로 만들지도, 메일을 보내지도 않는다.
# 통로가 로그인 없이 열려 있어 누구든 되풀이해 부를 수 있다 — 막지 않으면 남의 메일함에
# 재설정 링크를 계속 밀어 넣을 수 있고, 살아 있는 토큰도 그만큼 늘어난다.
RESEND_INTERVAL = timedelta(minutes=1)

# 메일에 담을 재설정 링크의 앞부분. 배포 주소는 환경변수로 준다.
DEFAULT_APP_ORIGIN = "http://localhost:5173"

RESET_SUBJECT = "[Banblit] 비밀번호 재설정"
FIND_ID_SUBJECT = "[Banblit] 아이디 안내"
BAD_TOKEN = "재설정 링크가 만료되었거나 이미 사용되었습니다"


def _find_account(session: Session, email: str) -> Member | None:
    # password_hash 가 없는 사람은 명단에만 올라 있고 가입한 적이 없다 — 바꿀 비밀번호도,
    # 알려줄 아이디도 없다.
    return session.scalar(
        select(Member).where(
            Member.email == email.strip(), Member.password_hash.is_not(None)
        )
    )


def _reset_link(token: str) -> str:
    # 값이 아예 없을 때와 빈 글자로 들어올 때를 같이 다룬다 — compose 가 채우지
    # 못한 환경변수는 지워지지 않고 빈 글자로 들어온다.
    origin = (os.environ.get("APP_ORIGIN") or DEFAULT_APP_ORIGIN).rstrip("/")
    return f"{origin}/reset-password?token={token}"


def issue_reset_token(session: Session, member_id: int, now: datetime) -> str | None:
    """새 재설정 토큰을 만들어 원문을 돌려준다. 되풀이 요청이면 아무것도 만들지 않고 None.

    앞서 나간 토큰은 지운다 — 한 계정에 살아 있는 토큰은 언제나 하나뿐이다.
    """
    # ponytail: 조회와 저장 사이에 잠금이 없다. 같은 계정으로 거의 동시에 들어온 두
    # 요청이 둘 다 이 검사를 지날 수 있고, 그러면 메일이 두 통 나간다. auth_service 의
    # _commit_signup 이 같은 얼개다. 이것이 문제되면 이 계정 행을 잠그고(FOR UPDATE) 센다.
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
    """아직 쓰이지 않고 기한도 남은 토큰에 쓴 표시를 남기고, 그 계정 번호를 돌려준다.

    찾기와 표시를 한 문장(UPDATE ... RETURNING)으로 한다 — 읽고 나서 쓰면 같은 토큰을
    동시에 들고 온 두 요청이 둘 다 통과할 수 있다.
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
    """그 이메일로 가입한 계정이 있으면 재설정 링크를 보낸다. 없으면 아무것도 하지 않는다.

    있든 없든 부르는 쪽은 같은 응답을 준다 — 갈라 답하면 그 이메일이 가입돼 있는지를
    알려주는 셈이 된다.

    ponytail: 간격은 계정 단위로만 둔다. 서로 다른 계정을 번갈아 부르면 그만큼 메일이
    나간다. 이것까지 막으려면 요청을 보낸 쪽(주소) 단위로 세는 자리가 필요한데, 그 자리는
    통로 앞(gateway)이지 이 함수가 아니다.
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
        f"{member.name}님, 아래 주소에서 새 비밀번호를 정해 주세요.\n\n"
        f"{_reset_link(token)}\n\n"
        f"이 링크는 {int(RESET_TTL.total_seconds() // 60)}분 뒤에 만료되고 한 번만 쓸 수 "
        "있습니다. 요청한 적이 없다면 이 메일을 버리셔도 됩니다.",
    )


def reset_password(session: Session, token: str, password: str, now: datetime) -> None:
    """토큰을 한 번 쓰고 비밀번호를 바꾼다. 못 쓰는 토큰이면 ValueError."""
    # 비밀번호를 먼저 본다. 뒤에 보면 규칙에 안 맞는 값 하나에 토큰이 타 버려,
    # 사람이 메일부터 다시 받아야 한다.
    require_password(password)
    member_id = _consume_token(session, token, now)
    if member_id is None:
        raise ValueError(BAD_TOKEN)
    member = session.get(Member, member_id)
    if member is None:
        raise ValueError(BAD_TOKEN)
    member.password_hash = hash_password(password)
    # 비밀번호를 바꾸면 그 계정으로 열려 있던 로그인을 전부 끊는다 — 안 끊으면 남이
    # 이미 들고 있는 세션이 새 비밀번호와 무관하게 계속 산다.
    revoke_member_sessions(session, member_id, now)
    session.commit()


def send_id_reminder(session: Session, name: str, email: str) -> None:
    """이름과 이메일이 함께 맞는 계정이 있을 때만 그 주소로 아이디를 알린다.

    아이디가 곧 이메일이라 화면에 보여줄 것이 없다 — 가려서 보여줘도 도메인과 앞 글자가
    새고, 메일함 주인만 볼 수 있는 자리로 보내면 아무것도 새지 않는다.

    ponytail: 되풀이 호출을 막지 않았다. 이름과 이메일을 둘 다 맞혀야 한 통이 나가고
    그 한 통은 본인 메일함으로만 간다. 같은 주소로 쏟아지는 것이 문제되면
    issue_reset_token 이 하는 것처럼 마지막 발송 시각을 남겨 간격을 둔다.
    """
    member = _find_account(session, email)
    if member is None or member.email is None or member.name != name.strip():
        return
    send_mail(
        member.email,
        FIND_ID_SUBJECT,
        f"{member.name}님, 이 주소가 Banblit 로그인 아이디입니다.\n\n"
        f"{member.email}\n\n"
        "요청한 적이 없다면 이 메일을 버리셔도 됩니다.",
    )
