import pytest

from backend.db import pipeline as pipeline_module
from backend.db.pipeline import get_engine, get_session, get_session_factory


def test_get_engine_reuses_the_same_engine_for_the_same_url() -> None:
    """요청마다 get_engine()을 불러도 접속 풀을 새로 만들지 않고 재사용해야 한다.

    매번 새로 만들면 요청 수만큼 접속 풀이 열려 DB 접속이 고갈된다.
    """
    first = get_engine()
    second = get_engine()

    assert first is second


def test_get_engine_fails_immediately_without_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        get_engine()


def test_get_session_closes_the_session_when_the_request_ends(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """요청이 끝나면 세션을 닫는다. 닫지 않으면 접속이 풀로 반납되지 않는다."""
    events: list[str] = []

    class FakeSession:
        def __init__(self, bind: object) -> None:
            events.append("open")

        def __enter__(self) -> "FakeSession":
            return self

        def __exit__(self, *exc_info: object) -> None:
            events.append("close")

    monkeypatch.setattr(pipeline_module, "Session", FakeSession)
    monkeypatch.setattr(pipeline_module, "get_engine", lambda: "engine")

    sessions = get_session()
    next(sessions)
    assert events == ["open"]

    with pytest.raises(StopIteration):
        next(sessions)
    assert events == ["open", "close"]


def test_session_factory_opens_a_new_session_each_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """배경 스레드가 요청 스레드와 다른 세션을 열 수 있도록, 부를 때마다 새 세션을 연다.

    Session 객체 하나를 여러 스레드가 같이 쓰면 안 되므로, 세션이 아니라
    "세션을 여는 함수"를 돌려줘야 스레드마다 자기 세션을 새로 열 수 있다.
    """
    opened: list[object] = []

    class FakeSession:
        def __init__(self, bind: object) -> None:
            opened.append(bind)

    monkeypatch.setattr(pipeline_module, "Session", FakeSession)
    monkeypatch.setattr(pipeline_module, "get_engine", lambda: "engine")

    factory = get_session_factory()
    factory()
    factory()

    assert opened == ["engine", "engine"]
