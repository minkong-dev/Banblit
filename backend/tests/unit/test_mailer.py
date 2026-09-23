import logging

import pytest

from backend.services.mailer import send_mail

TO = "seoyeon@example.com"
SUBJECT = "[Banblit] 비밀번호 재설정"
BODY = "http://localhost:5173/reset-password?token=secret-token-value"


def _send_without_smtp(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, log_body: str
) -> str:
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.setenv("MAIL_LOG_BODY", log_body)
    with caplog.at_level(logging.INFO, logger="backend.services.mailer"):
        send_mail(TO, SUBJECT, BODY)
    return caplog.text


def test_development_records_the_body_because_that_is_where_the_mail_lands(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    recorded = _send_without_smtp(monkeypatch, caplog, "true")

    assert "secret-token-value" in recorded


def test_a_deployment_missing_the_settings_records_the_failure_without_the_body(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    recorded = _send_without_smtp(monkeypatch, caplog, "false")

    # 본문에는 재설정 token 이 포함되어 있습니다. 설정을 빠뜨린 배포 환경에서 token 이 로그로 노출되면 안 됩니다.
    assert "secret-token-value" not in recorded
    assert TO in recorded


def test_the_deployment_log_setup_does_not_let_the_body_through() -> None:
    """배포 환경의 기록 설정에서 mailer 의 INFO(메일 본문)가 통과하지 않는지 확인합니다.

    본문에는 재설정 token 이 들어 있습니다. backend logger 전체의 수준을 INFO 로 올리면
    MAIL_LOG_BODY 를 잘못 설정한 배포 환경에서 token 이 기록에 남습니다.
    """
    import backend.api.app  # noqa: F401 — import 하는 것만으로 기록 설정이 적용됩니다

    assert not logging.getLogger("backend.services.mailer").isEnabledFor(logging.INFO)
    # 메일 발송 사유는 반대로 남아야 합니다.
    assert logging.getLogger("backend.services.password_reset").isEnabledFor(logging.INFO)
