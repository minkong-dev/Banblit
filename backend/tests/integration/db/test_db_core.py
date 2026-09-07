import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Member, Team, TeamSlot


def test_two_members_may_share_a_name(db_session: Session) -> None:
    db_session.add_all([Member(name="김민수"), Member(name="김민수")])
    db_session.commit()
    assert len(db_session.scalars(select(Member)).all()) == 2


def test_team_name_must_be_unique(db_session: Session) -> None:
    db_session.add_all([Team(name="A"), Team(name="A")])
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_person_cannot_take_two_slots_of_one_team(db_session: Session) -> None:
    """겸하면 배정 계산이 그 사람을 같은 시간에 두 번 센다."""
    member = Member(name="김민수")
    team = Team(name="A")
    db_session.add_all([member, team])
    db_session.flush()
    db_session.add(
        TeamSlot(team_id=team.id, instrument="일렉", ordinal=1, member_id=member.id)
    )
    db_session.flush()
    db_session.add(
        TeamSlot(team_id=team.id, instrument="드럼", ordinal=1, member_id=member.id)
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_one_person_may_sit_in_two_teams(db_session: Session) -> None:
    member = Member(name="김민수")
    team_a, team_b = Team(name="A"), Team(name="B")
    db_session.add_all([member, team_a, team_b])
    db_session.flush()
    db_session.add_all(
        [
            TeamSlot(
                team_id=team_a.id, instrument="일렉", ordinal=1, member_id=member.id
            ),
            TeamSlot(
                team_id=team_b.id, instrument="드럼", ordinal=1, member_id=member.id
            ),
        ]
    )
    db_session.commit()
    assert len(db_session.scalars(select(TeamSlot)).all()) == 2


def test_many_empty_slots_may_share_a_team(db_session: Session) -> None:
    """빈 자리끼리는 겹침 조건에 걸리지 않는다 — 저장소가 빈 값을 서로 다르게 본다."""
    team = Team(name="A")
    db_session.add(team)
    db_session.flush()
    db_session.add_all(
        [
            TeamSlot(team_id=team.id, instrument="일렉", ordinal=1),
            TeamSlot(team_id=team.id, instrument="일렉", ordinal=2),
            TeamSlot(team_id=team.id, instrument="드럼", ordinal=1),
        ]
    )
    db_session.commit()
    assert len(db_session.scalars(select(TeamSlot)).all()) == 3


def test_the_same_place_cannot_exist_twice_in_a_team(db_session: Session) -> None:
    team = Team(name="A")
    db_session.add(team)
    db_session.flush()
    db_session.add_all(
        [
            TeamSlot(team_id=team.id, instrument="일렉", ordinal=1),
            TeamSlot(team_id=team.id, instrument="일렉", ordinal=1),
        ]
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
