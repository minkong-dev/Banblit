from typing import NoReturn

from backend.db import health


class _BrokenEngine:
    def connect(self) -> NoReturn:
        """접속 자체가 실패하는 mock engine입니다. 반환 값이 없으므로 NoReturn입니다."""
        raise RuntimeError('connection failed: host="db" user="banblit" password="secret"')


def test_connection_failure_does_not_leak_the_driver_message() -> None:
    """드라이버 오류 메시지에는 호스트·사용자·비밀번호가 포함됩니다. /health endpoint는 인증 없이$
    공개되어 있으므로 응답에는 사람이 읽을 수 있는 한 줄만 포함하고, 원문은 로그에만 남깁니다."""
    status = health.check_database(_BrokenEngine())  # type: ignore[arg-type]

    assert status.ok is False
    assert "secret" not in status.detail
    assert "db" not in status.detail
    assert "데이터베이스" in status.detail
