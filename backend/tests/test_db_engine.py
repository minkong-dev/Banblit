import pytest

from backend.db.engine import get_engine


def test_get_engine_reuses_the_same_engine_for_the_same_url() -> None:
    """요청마다 get_engine()을 불러도 접속 풀을 새로 만들지 않고 재사용해야 한다.
    매번 create_engine을 새로 부르면 요청마다 새 접속 풀이 열려 접속이 고갈된다."""
    first = get_engine()
    second = get_engine()

    assert first is second


def test_get_engine_still_fails_immediately_without_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """엔진 캐싱을 넣어도, DATABASE_URL 미설정 시 즉시 실패하는 기존 계약은 그대로여야 한다."""
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        get_engine()
