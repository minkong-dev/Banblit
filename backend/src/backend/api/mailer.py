import logging
import os
import smtplib
import ssl
import threading
from email.message import EmailMessage

logger = logging.getLogger(__name__)

# SMTP 서버가 응답하지 않을 때 연결을 끊기까지 기다리는 시간(초)입니다.
SMTP_TIMEOUT_SECONDS = 10

DEFAULT_SMTP_PORT = 587
DEFAULT_SENDER = "banblit@localhost"


def _log_body() -> bool:
    """SMTP_HOST 가 없을 때 메일 본문을 로그에 남길지 결정합니다. MAIL_LOG_BODY=true 로 설정한 개발
    환경에서만 True 를 반환합니다. 배포 환경에서는 재설정 link 가 로그에 남으면 안 되기 때문입니다."""
    return os.environ.get("MAIL_LOG_BODY", "false").lower() == "true"


def _deliver(message: EmailMessage, host: str, port: int, user: str, password: str) -> None:
    """한 통의 메일을 실제로 SMTP 서버로 전송합니다. 요청 처리 스레드가 아니라 별도 스레드에서 실행됩니다."""
    try:
        with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
            # context 를 전달하지 않으면 smtplib 이 인증서를 검증하지 않고 연결합니다. 이 연결로
            # 재설정 token 과 SMTP 계정 비밀번호가 전송되므로 ssl.create_default_context() 로 인증서를 검증합니다.
            smtp.starttls(context=ssl.create_default_context())
            if user:
                smtp.login(user, password)
            smtp.send_message(message)
    except OSError as error:
        # smtplib.SMTPException은 OSError를 상속합니다 — 연결 실패와 발송 거부가 함께 처리됩니다.
        logger.error("메일을 보내지 못했습니다 — 받는 사람 %s: %s", message["To"], error)


def send_mail(to: str, subject: str, body: str) -> None:
    """to 에게 제목과 본문으로 구성된 메일 1통을 전송합니다. 발송 서비스를 변경할 때 수정하는 함수는 이 함수 하나입니다.

    SMTP_HOST 가 없을 경우 개발 환경에서는 본문을 로그에 남기고, 배포 환경에서는 본문 없이
    전송 실패만 로그에 남깁니다. 본문에는 재설정 token 이 포함되므로, 설정을 빠뜨린 배포 환경에서
    로그에 노출되면 그 token 으로 계정을 탈취할 수 있기 때문입니다.

    실제 발송은 별도 스레드에 위임하고 즉시 반환합니다. 호출자(비밀번호 재설정·아이디 안내)는
    계정 존재 여부와 관계없이 같은 응답을 반환해야 하는데, 이 함수에서 최대 SMTP_TIMEOUT_SECONDS 만큼
    대기하면 응답 시간을 측정하는 것만으로 그 이메일이 가입되어 있는지 판단할 수 있기 때문입니다.

    ponytail: 실패해도 재전송하지 않고, 프로세스가 종료되면 전송 중인 메일이 손실됩니다.
    발송 실패를 처리하려면 전송 대기 목록을 table 에 저장하고 그 table 을 주기적으로 처리하는 방식으로 변경합니다.
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
            "SMTP_HOST 가 없어 보내지 않고 로그만 남깁니다 — 받는 사람 %s / 제목 %s\n%s",
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

    # 빈 문자열은 미설정으로 처리합니다 — int("")는 예외입니다.
    port = int(os.environ.get("SMTP_PORT") or DEFAULT_SMTP_PORT)
    password = os.environ.get("SMTP_PASSWORD", "")
    threading.Thread(
        target=_deliver, args=(message, host, port, user, password), daemon=True
    ).start()
