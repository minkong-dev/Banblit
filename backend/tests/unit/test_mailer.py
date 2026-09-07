import logging

import pytest

from backend.api.mailer import send_mail

TO = "seoyeon@example.com"
SUBJECT = "[Banblit] 비밀번호 재설정"
BODY = "http://localhost:5173/reset-password?token=secret-token-value"


def _send_without_smtp(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, deployment: str
) -> str:
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.setenv("COOKIE_SECURE", deployment)
    with caplog.at_level(logging.INFO, logger="backend.api.mailer"):
        send_mail(TO, SUBJECT, BODY)
    return caplog.text


def test_development_records_the_body_because_that_is_where_the_mail_lands(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    recorded = _send_without_smtp(monkeypatch, caplog, "false")

    assert "secret-token-value" in recorded


def test_a_deployment_missing_the_settings_records_the_failure_without_the_body(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    recorded = _send_without_smtp(monkeypatch, caplog, "true")

    # 본문에는 재설정 토큰이 들어 있다 — 설정을 빠뜨린 배포에서 기록으로 새면 안 된다.
    assert "secret-token-value" not in recorded
    assert TO in recorded
