from typing import cast

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.api.room_service import commit_room, duplicate_name_message

# schedule_store.py의 test_schedule_commit.py와 같은 가짜들 — 실제 psycopg 예외의
# orig.diag.constraint_name 모양을 흉내내, 실제 DB 없이 판별식만 단위로 검사한다.


class _FakeDiag:
    def __init__(self, constraint_name: str) -> None:
        self.constraint_name = constraint_name


class _FakeOrig(Exception):
    def __init__(self, constraint_name: str) -> None:
        super().__init__(constraint_name)
        self.diag = _FakeDiag(constraint_name)


def _fake_integrity_error(constraint_name: str) -> IntegrityError:
    return IntegrityError("stmt", {}, _FakeOrig(constraint_name))


class _FakeSession:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.committed = False
        self.rolled_back = False

    def commit(self) -> None:
        self.committed = True
        if self.error is not None:
            raise self.error

    def rollback(self) -> None:
        self.rolled_back = True


def test_duplicate_name_message_for_the_room_name_unique_violation() -> None:
    error = _fake_integrity_error("rooms_name_key")

    assert duplicate_name_message(error) == "이미 있는 합주실 이름입니다"


def test_duplicate_name_message_for_a_different_constraint_is_none() -> None:
    error = _fake_integrity_error("rooms_closes_after_opens")

    assert duplicate_name_message(error) is None


def test_commit_room_commits_when_nothing_conflicts() -> None:
    session = _FakeSession()

    commit_room(cast(Session, session))

    assert session.committed
    assert not session.rolled_back


def test_commit_room_turns_a_name_race_into_a_friendly_value_error() -> None:
    """이름 중복 사전 검사와 commit 사이의 경합에서 실제로 나는 예외를 흉내낸다."""
    session = _FakeSession(_fake_integrity_error("rooms_name_key"))

    with pytest.raises(ValueError, match="이미 있는 합주실 이름입니다"):
        commit_room(cast(Session, session))

    assert session.rolled_back


def test_commit_room_reraises_other_integrity_errors() -> None:
    session = _FakeSession(_fake_integrity_error("rooms_closes_after_opens"))

    with pytest.raises(IntegrityError):
        commit_room(cast(Session, session))

    assert session.rolled_back
