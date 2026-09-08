from backend.db import health


class _BrokenEngine:
    def connect(self):  # noqa: ANN201 - 가짜 엔진, 접속 자체가 터진다
        raise RuntimeError('connection failed: host="db" user="banblit" password="secret"')


def test_connection_failure_does_not_leak_the_driver_message() -> None:
    """드라이버 오류 문장에는 호스트·사용자·비밀번호가 섞인다. /health 는 인증 없이
    열려 있으므로 응답에는 사람이 읽을 한 줄만 싣고, 원문은 기록에만 남긴다."""
    status = health.check_database(_BrokenEngine())  # type: ignore[arg-type]

    assert status.ok is False
    assert "secret" not in status.detail
    assert "db" not in status.detail
    assert "데이터베이스" in status.detail
