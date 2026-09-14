import logging
import os
import smtplib
import ssl
import threading
from email.message import EmailMessage

logger = logging.getLogger(__name__)

# 서버가 응답하지 않을 때 발신자가 무한 대기를 피하도록 설정하는 시간(초)입니다.
SMTP_TIMEOUT_SECONDS = 10

DEFAULT_SMTP_PORT = 587
DEFAULT_SENDER = "banblit@localhost"


def _log_body() -> bool:
    """SMTP가 없을 때 본문을 기록에 남길지 결정합니다. 개발용 재정의가 MAIL_LOG_BODY=true로 활성화합니다 —
    배포 환경에서는 재설정 link가 기록에 남으면 안 되기 때문입니다."""
    return os.environ.get("MAIL_LOG_BODY", "false").lower() == "true"


def _deliver(message: EmailMessage, host: str, port: int, user: str, password: str) -> None:
    """한 통의 메일을 실제로 SMTP 서버로 전송합니다. 요청 처리 스레드가 아니라 별도 스레드에서 실행됩니다."""
    try:
        with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
            # context를 전달하지 않으면 smtplib이 인증서를 검증하지 않는 레거시 방식으로 연결됩니다.
            # 이 연결을 통해 재설정 token과 SMTP 계정 비밀번호가 전송되므로 기본 검증을 설정합니다.
            smtp.starttls(context=ssl.create_default_context())
            if user:
                smtp.login(user, password)
            smtp.send_message(message)
    except OSError as error:
        # smtplib.SMTPException은 OSError를 상속합니다 — 연결 실패와 발송 거부가 함께 처리됩니다.
        logger.error("메일을 보내지 못했습니다 — 받는 사람 %s: %s", message["To"], error)


def send_mail(to: str, subject: str, body: str) -> None:
    """to에게 제목과 본문으로 구성된 한 통의 메일을 전송합니다. 발송 서비스로 변경할 때 수정하는 부분은 여기 하나입니다.

    SMTP_HOST가 없을 경우 개발 환경에서는 본문을 기록에 남기고,
    배포 환경에서는 본문 없이 전송 실패만 기록합니다 — 본문에는 재설정 token이 포함되어
    설정을 빠뜨린 배포 환경에서 기록에 노출되면 그 token으로 계정을 탈취할 수 있기 때문입니다.

    실제 발송은 별도 스레드에 위임하고 즉시 반환합니다. 호출자(비밀번호 재설정·아이디 안내)는
    계정 여부와 관계없이 동일한 응답을 반환해야 하는데, 여기서 최대 10초를 대기하면 응답 시간을 측정하는 것만으로도
    그 이메일이 가입되어 있는지 판단할 수 있기 때문입니다.

    ponytail: 실패해도 재전송하지 않고, 프로세스가 종료되면 전송 중인 메일이 손실됩니다.
    발송 실패를 처리하려면 전송 대기 목록을 테이블에 유지하고 그 테이블을 주기적으로 처리하는 방식으로 변경하면 됩니다.
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

    # 빈 문자열은 미설정으로 처리합니다 — int("")는 예외입니다.
    port = int(os.environ.get("SMTP_PORT") or DEFAULT_SMTP_PORT)
    password = os.environ.get("SMTP_PASSWORD", "")
    threading.Thread(
        target=_deliver, args=(message, host, port, user, password), daemon=True
    ).start()
