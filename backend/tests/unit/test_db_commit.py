"""제약 위반을 메시지로 변환하는 module 은 하나입니다. table 마다 같은 try/except 를 반복하지 않습니다."""

from types import SimpleNamespace
from typing import cast

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.commit import commit_translating


class _Session:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.committed = 0
        self.rolled_back = 0

    def commit(self) -> None:
        if self.error is not None:
            raise self.error
        self.committed += 1

    def rollback(self) -> None:
        self.rolled_back += 1


def _violation(constraint: str) -> IntegrityError:
    orig = SimpleNamespace(diag=SimpleNamespace(constraint_name=constraint))
    return IntegrityError("INSERT", {}, cast(Exception, orig))


class _Conflict(ValueError):
    pass


def test_a_known_constraint_becomes_the_given_message() -> None:
    session = _Session(_violation("rooms_name_key"))

    with pytest.raises(ValueError, match="이미 있는 합주실 이름입니다"):
        commit_translating(cast(Session, session), {"rooms_name_key": "이미 있는 합주실 이름입니다"})

    assert session.rolled_back == 1


def test_an_unknown_constraint_is_raised_as_is() -> None:
    """알려지지 않은 제약에 무관한 메시지를 붙이면 잘못된 위치를 수정하도록 유도하므로, 원래 예외를 그대로 발생시킵니다."""
    session = _Session(_violation("something_else"))

    with pytest.raises(IntegrityError):
        commit_translating(cast(Session, session), {"rooms_name_key": "이미 있는 합주실 이름입니다"})

    assert session.rolled_back == 1


def test_a_clean_commit_just_commits() -> None:
    session = _Session()

    commit_translating(cast(Session, session), {"rooms_name_key": "x"})

    assert session.committed == 1
    assert session.rolled_back == 0


def test_the_error_type_can_be_narrowed() -> None:
    """db 층은 ValueError 의 하위 class(ScheduleConflict)로 예외를 발생시켜, 호출자가 선택적으로 처리할 수 있게 합니다."""
    session = _Session(_violation("k"))

    with pytest.raises(_Conflict):
        commit_translating(cast(Session, session), {"k": "겹친다"}, error_type=_Conflict)


def test_an_action_other_than_commit_is_translated_too() -> None:
    """flush에서 먼저 검출되는 제약(고유성 조건)도 같은 자리에서 메시지로 변환됩니다."""
    session = _Session()

    def flush() -> None:
        raise _violation("members_email_key")

    with pytest.raises(ValueError, match="이미 가입된 이메일입니다"):
        commit_translating(
            cast(Session, session), {"members_email_key": "이미 가입된 이메일입니다"}, action=flush
        )
    assert session.rolled_back == 1
