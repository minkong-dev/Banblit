from typing import cast

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.api.roster_service import commit_roster, duplicate_message, require_team_name

# room_service의 test_room_commit.py와 같은 가짜들 — 실제 psycopg 예외의
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


def test_require_team_name_trims_surrounding_whitespace() -> None:
    assert require_team_name("  새벽 네시  ") == "새벽 네시"


def test_require_team_name_rejects_an_empty_string() -> None:
    with pytest.raises(ValueError, match="팀 이름"):
        require_team_name("")


def test_require_team_name_rejects_a_whitespace_only_string() -> None:
    with pytest.raises(ValueError, match="팀 이름"):
        require_team_name("   ")


def test_duplicate_message_for_the_team_name_unique_violation() -> None:
    error = _fake_integrity_error("teams_name_key")

    assert duplicate_message(error) == "이미 있는 팀 이름입니다"


def test_duplicate_message_for_the_membership_unique_violation() -> None:
    error = _fake_integrity_error("memberships_member_id_team_id_key")

    assert duplicate_message(error) == "이미 그 팀 소속입니다"


def test_duplicate_message_for_a_different_constraint_is_none() -> None:
    error = _fake_integrity_error("teams_pkey")

    assert duplicate_message(error) is None


def test_commit_roster_commits_when_nothing_conflicts() -> None:
    session = _FakeSession()

    commit_roster(cast(Session, session))

    assert session.committed
    assert not session.rolled_back


def test_commit_roster_turns_a_name_race_into_a_friendly_value_error() -> None:
    session = _FakeSession(_fake_integrity_error("teams_name_key"))

    with pytest.raises(ValueError, match="이미 있는 팀 이름입니다"):
        commit_roster(cast(Session, session))

    assert session.rolled_back


def test_commit_roster_turns_a_membership_race_into_a_friendly_value_error() -> None:
    session = _FakeSession(_fake_integrity_error("memberships_member_id_team_id_key"))

    with pytest.raises(ValueError, match="이미 그 팀 소속입니다"):
        commit_roster(cast(Session, session))

    assert session.rolled_back


def test_commit_roster_reraises_other_integrity_errors() -> None:
    session = _FakeSession(_fake_integrity_error("teams_pkey"))

    with pytest.raises(IntegrityError):
        commit_roster(cast(Session, session))

    assert session.rolled_back
