from typing import cast

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.schedule_store import (
    ScheduleConflict,
    commit_schedule,
    conflict_message_for,
)


class _FakeDiag:
    def __init__(self, constraint_name: str) -> None:
        self.constraint_name = constraint_name


class _FakeOrig(Exception):
    def __init__(self, constraint_name: str) -> None:
        super().__init__(constraint_name)
        self.diag = _FakeDiag(constraint_name)


def _fake_integrity_error(constraint_name: str) -> IntegrityError:
    # 실제 psycopg 예외를 컨테이너에서 직접 재현해 관찰한 모양(orig.diag.constraint_name)을
    # 그대로 흉내낸다 — 실제 DB 없이 판별식만 단위로 검사하기 위한 가짜다.
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


def test_commit_schedule_commits_when_nothing_conflicts() -> None:
    session = _FakeSession()

    commit_schedule(cast(Session, session))

    assert session.committed
    assert not session.rolled_back


def test_commit_schedule_turns_a_room_time_conflict_into_schedule_conflict() -> None:
    """방·시각 충돌은 되돌린 뒤 사용자용 문장을 담은 ScheduleConflict 로 올린다.

    배정 경로와 되돌리기 경로가 각자 이 처리를 들고 있으면 한쪽만 고쳤을 때
    조용히 어긋난다 — 판별과 확정을 저장 계층 한 곳에 둔다.
    """
    session = _FakeSession(_fake_integrity_error("assignments_room_id_starts_at_key"))

    with pytest.raises(ScheduleConflict) as raised:
        commit_schedule(cast(Session, session))

    assert session.rolled_back
    assert "다른 기간" in str(raised.value)


def test_schedule_conflict_is_a_value_error() -> None:
    """부르는 쪽이 잘못된 입력과 같은 자리에서 잡아 422로 답할 수 있어야 한다."""
    assert issubclass(ScheduleConflict, ValueError)


def test_commit_schedule_reraises_other_integrity_errors() -> None:
    """원인이 다른 사고에 같은 설명을 붙이면 사용자가 엉뚱한 곳을 찾게 된다."""
    session = _FakeSession(_fake_integrity_error("assignments_team_id_fkey"))

    with pytest.raises(IntegrityError):
        commit_schedule(cast(Session, session))

    assert session.rolled_back


def test_conflict_message_for_the_room_time_unique_violation() -> None:
    """(room_id, starts_at) 유니크 위반은 사용자용 문장으로 바꾼다.

    컨테이너에서 실제 충돌을 재현해 관찰한 결과, "다른 기간이 같은 방·시각을 쓰는
    경우"와 "같은 기간을 동시에 두 번 저장하는 경우" 모두 UniqueViolation 이고
    diag.constraint_name 이 "assignments_room_id_starts_at_key"로 같아, DB 정보만으로는
    두 경우를 구분할 수 없다 — 문구가 두 경우를 모두 담아야 한다.
    """
    error = _fake_integrity_error("assignments_room_id_starts_at_key")

    message = conflict_message_for(error)

    assert message is not None
    assert "다른 기간" in message
    assert "동시" in message


def test_conflict_message_for_a_foreign_key_violation_is_none() -> None:
    """팀·합주실이 저장 직전에 삭제되어 생기는 외래키 위반은 원인이 다르다."""
    error = _fake_integrity_error("assignments_team_id_fkey")

    assert conflict_message_for(error) is None


def test_conflict_message_for_a_check_violation_is_none() -> None:
    error = _fake_integrity_error("assignments_check")

    assert conflict_message_for(error) is None
