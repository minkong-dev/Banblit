import logging
import os
import smtplib
import ssl
import threading
from email.message import EmailMessage

logger = logging.getLogger(__name__)

# 서버가 답하지 않을 때 보내는 쪽이 끝없이 매달리지 않도록 끊는 시간(초).
SMTP_TIMEOUT_SECONDS = 10

DEFAULT_SMTP_PORT = 587
DEFAULT_SENDER = "banblit@localhost"


def _log_body() -> bool:
    """SMTP 가 없을 때 본문까지 기록에 남길지. 개발 override 가 MAIL_LOG_BODY=true 로 켠다 —
    배포에서는 재설정 링크가 기록에 남으면 안 된다."""
    return os.environ.get("MAIL_LOG_BODY", "false").lower() == "true"


def _deliver(message: EmailMessage, host: str, port: int, user: str, password: str) -> None:
    """한 통을 실제로 SMTP 서버에 넘긴다. 요청을 처리하는 thread 가 아니라 다른 thread 에서 실행된다."""
    try:
        with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
            # context 를 주지 않으면 smtplib 이 인증서를 확인하지 않는 옛 방식으로 붙는다.
            # 이 연결로 재설정 토큰과 SMTP 계정 비밀번호가 나가므로 기본 검증을 명시한다.
            smtp.starttls(context=ssl.create_default_context())
            if user:
                smtp.login(user, password)
            smtp.send_message(message)
    except OSError as error:
        # smtplib.SMTPException 은 OSError 를 상속한다 — 연결 실패와 발송 거절이 함께 잡힌다.
        logger.error("메일을 보내지 못했습니다 — 받는 사람 %s: %s", message["To"], error)


def send_mail(to: str, subject: str, body: str) -> None:
    """to 에게 제목·본문 한 통을 보낸다. 발송 서비스로 갈아탈 때 고치는 곳은 여기 하나다.

    SMTP_HOST 가 없으면 개발에서는 본문을 기록에 남기고,
    배포에서는 본문 없이 못 보냈다는 것만 남긴다 — 본문에는 재설정 토큰이 들어 있어
    설정을 빠뜨린 배포에서 기록으로 새면 그것으로 계정을 가져갈 수 있다.

    실제 발송은 다른 thread 에 맡기고 곧바로 돌아온다. 부르는 쪽(비밀번호 재설정·아이디 안내)은
    계정이 있든 없든 같은 응답을 줘야 하는데, 여기서 최대 10초를 기다리면 응답 시간만
    재도 그 이메일이 가입돼 있는지 갈라낼 수 있다.

    ponytail: 실패해도 다시 보내지 않고, 프로세스가 내려가면 보내던 것이 사라진다.
    발송 실패를 되살려야 하면 보낼 것을 table 에 적고 그 table 을 훑는 쪽으로 바꾼다.
    """
    host = os.environ.get("SMTP_HOST", "")
    user = os.environ.get("SMTP_USER", "")
    sender = os.environ.get("MAIL_FROM") or user or DEFAULT_SENDER
    if not host:
        if not _log_body():
            logger.error(
                "SMTP_HOST 가 없어 메일을 보내지 못했습니다 — 받는 사람 %s / 제목 %s", to, subject
            )
            return
        logger.info(
            "SMTP_HOST 가 없어 보내지 않고 기록만 남깁니다 — 받는 사람 %s / 제목 %s\n%s",
            to,
            subject,
            body,
        )
        return

    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    # 빈 글자로 들어온 값은 없는 것으로 본다 — int("") 는 예외다.
    port = int(os.environ.get("SMTP_PORT") or DEFAULT_SMTP_PORT)
    password = os.environ.get("SMTP_PASSWORD", "")
    threading.Thread(
        target=_deliver, args=(message, host, port, user, password), daemon=True
    ).start()
