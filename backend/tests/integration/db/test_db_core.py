import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Member, Membership, Position, Team


def test_default_positions_are_seeded(db_session: Session) -> None:
    # 서포터즈는 accounts-and-roles 마이그레이션이 추가했다 — 가입 화면(SignUp)의
    # 선택지가 core_tables 마이그레이션이 넣은 다섯보다 하나 더 많았다.
    names = set(db_session.scalars(select(Position.name)))
    assert names == {"보컬", "기타", "베이스", "드럼", "키보드", "서포터즈"}


def test_two_members_may_share_a_name(db_session: Session) -> None:
    db_session.add_all([Member(name="김민수"), Member(name="김민수")])
    db_session.commit()
    assert len(db_session.scalars(select(Member)).all()) == 2


def test_team_name_must_be_unique(db_session: Session) -> None:
    db_session.add_all([Team(name="A"), Team(name="A")])
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_same_person_cannot_join_same_team_twice(db_session: Session) -> None:
    member = Member(name="김민수")
    team = Team(name="A")
    guitar = db_session.scalars(select(Position).where(Position.name == "기타")).one()
    drums = db_session.scalars(select(Position).where(Position.name == "드럼")).one()
    db_session.add_all([member, team])
    db_session.flush()
    db_session.add(
        Membership(member_id=member.id, team_id=team.id, position_id=guitar.id)
    )
    db_session.flush()
    db_session.add(
        Membership(member_id=member.id, team_id=team.id, position_id=drums.id)
    )
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_one_person_may_join_two_teams_with_different_positions(
    db_session: Session,
) -> None:
    member = Member(name="김민수")
    team_a, team_b = Team(name="A"), Team(name="B")
    guitar = db_session.scalars(select(Position).where(Position.name == "기타")).one()
    drums = db_session.scalars(select(Position).where(Position.name == "드럼")).one()
    db_session.add_all([member, team_a, team_b])
    db_session.flush()
    db_session.add_all(
        [
            Membership(member_id=member.id, team_id=team_a.id, position_id=guitar.id),
            Membership(member_id=member.id, team_id=team_b.id, position_id=drums.id),
        ]
    )
    db_session.commit()
    assert len(db_session.scalars(select(Membership)).all()) == 2
