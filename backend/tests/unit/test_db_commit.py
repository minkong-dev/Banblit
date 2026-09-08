"""제약 위반을 문장으로 바꾸는 자리는 하나다 — 표마다 같은 try/except 를 두지 않는다."""

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
    """모르는 제약에 아는 척 문구를 붙이면 엉뚱한 곳을 고치게 만든다 — 원래 예외 그대로."""
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
    """저장소 층은 ValueError 의 자식(ScheduleConflict)으로 올려 부르는 쪽이 가려 잡게 한다."""
    session = _Session(_violation("k"))

    with pytest.raises(_Conflict):
        commit_translating(cast(Session, session), {"k": "겹친다"}, error_type=_Conflict)


def test_an_action_other_than_commit_is_translated_too() -> None:
    """flush 에서 먼저 걸리는 제약(신원 조건)도 같은 자리에서 문장이 된다."""
    session = _Session()

    def flush() -> None:
        raise _violation("members_email_key")

    with pytest.raises(ValueError, match="이미 가입된 이메일입니다"):
        commit_translating(
            cast(Session, session), {"members_email_key": "이미 가입된 이메일입니다"}, action=flush
        )
    assert session.rolled_back == 1
