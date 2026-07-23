from datetime import date, datetime, time, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.period_service import assign_period
from backend.db.models import (
    Assignment,
    AssignmentBackup,
    Member,
    Membership,
    Period,
    Position,
    Room,
    Team,
    UnavailableTime,
)

SAVED_AT = datetime(2026, 8, 1, 9, 0)


def _position(session: Session) -> int:
    return session.scalars(select(Position.id)).first()


def _period(session: Session, kind: str = "focused", days: int = 1) -> int:
    starts_on = date(2026, 8, 1)
    period = Period(
        kind=kind,
        starts_on=starts_on,
        ends_on=starts_on + timedelta(days=days - 1),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    session.add(period)
    session.flush()
    return period.id


def _team_with_member(session: Session, team_name: str, member_name: str) -> int:
    team = Team(name=team_name)
    member = Member(name=member_name)
    session.add_all([team, member])
    session.flush()
    session.add(
        Membership(
            member_id=member.id, team_id=team.id, position_id=_position(session)
        )
    )
    session.flush()
    return team.id


def _room(session: Session, name: str, opens: time, closes: time) -> int:
    room = Room(name=name, opens_at=opens, closes_at=closes)
    session.add(room)
    session.flush()
    return room.id


def test_successful_assignment_is_saved_as_the_current_schedule(
    db_session: Session,
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))  # 2칸

    result = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is True
    assert result.saved is True
    saved = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert len(saved) == 2  # 팀 하나가 전체 2칸을 가져간다
    assert {row.room_id for row in saved} == {room_id}
    assert {row.team_id for row in saved} == {team_id}


def test_successful_assignment_round_trips_rooms_teams_and_times(
    db_session: Session,
) -> None:
    """방 2개(운영시간이 다름)·팀 2개·이틀짜리 기간으로 되돌림 왕복을 구체값까지 확인한다."""
    period_id = _period(db_session, days=2)  # 8/1 ~ 8/2
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "박지훈")
    room_1 = _room(db_session, "1번방", time(18, 0), time(19, 0))  # 하루 2칸
    room_2 = _room(db_session, "2번방", time(20, 0), time(21, 0))  # 하루 2칸, 다른 시간대

    result = assign_period(
        db_session, period_id, [team_a, team_b], [room_1, room_2], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is True
    assert result.saved is True
    saved = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()

    # 하루 4칸(방 2개 × 2칸) × 이틀 = 8칸, 팀 2개가 4칸씩 나눠 가진다.
    assert len(saved) == 8

    operating_hours = {
        room_1: (time(18, 0), time(19, 0)),
        room_2: (time(20, 0), time(21, 0)),
    }
    dates_seen = set()
    for row in saved:
        opens, closes = operating_hours[row.room_id]
        assert row.starts_at.date() == row.ends_at.date()
        assert opens <= row.starts_at.time() < row.ends_at.time() <= closes
        dates_seen.add(row.starts_at.date())
    assert dates_seen == {date(2026, 8, 1), date(2026, 8, 2)}

    team_counts: dict[int, int] = {}
    for row in saved:
        team_counts[row.team_id] = team_counts.get(row.team_id, 0) + 1
    assert team_counts == {team_a: 4, team_b: 4}


def test_failed_assignment_saves_nothing_and_names_who_to_exclude(
    db_session: Session,
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    # 두 번째 멤버를 넣고 그 사람만 운영시간 내내 불가능하게 만든다.
    other = Member(name="이영희")
    db_session.add(other)
    db_session.flush()
    db_session.add(
        Membership(
            member_id=other.id, team_id=team_id, position_id=_position(db_session)
        )
    )
    db_session.add(
        UnavailableTime(
            member_id=other.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            repeats_weekly=False,
            repeat_until=None,
        )
    )
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    result = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is False
    assert result.saved is False
    assert db_session.scalars(select(Assignment)).all() == []
    excluded = [
        result.member_by_key[p.excluded_member][1]
        for p in result.resolution.proposals
    ]
    assert excluded == ["이영희"]


def test_open_period_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session, kind="open")
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    with pytest.raises(ValueError, match="집중"):
        assign_period(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)


def test_unknown_team_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    with pytest.raises(ValueError, match="그런 팀이 없습니다"):
        assign_period(db_session, period_id, [999999], [room_id], saved_at=SAVED_AT)


def test_unknown_room_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")

    with pytest.raises(ValueError, match="그런 합주실이 없습니다"):
        assign_period(db_session, period_id, [team_id], [999999], saved_at=SAVED_AT)


def test_reassignment_archives_the_previous_schedule(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    assign_period(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)
    assign_period(
        db_session,
        period_id,
        [team_id],
        [room_id],
        saved_at=datetime(2026, 8, 1, 21, 0),
    )

    backups = db_session.scalars(select(AssignmentBackup)).all()
    assert len(backups) == 2  # 첫 회차의 2칸이 백업으로 옮겨졌다
    assert {b.saved_at for b in backups} == {datetime(2026, 8, 1, 21, 0)}


def test_failed_reassignment_preserves_the_current_schedule(
    db_session: Session,
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    first = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )
    assert first.saved is True
    before = {
        (row.room_id, row.team_id, row.starts_at, row.ends_at)
        for row in db_session.scalars(
            select(Assignment).where(Assignment.period_id == period_id)
        ).all()
    }

    # 유일한 멤버를 운영시간 내내 불가능하게 만들어 재계산을 불가능하게 한다.
    member_id = db_session.scalars(
        select(Member.id).where(Member.name == "김민수")
    ).one()
    db_session.add(
        UnavailableTime(
            member_id=member_id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            repeats_weekly=False,
            repeat_until=None,
        )
    )
    db_session.flush()

    second = assign_period(
        db_session,
        period_id,
        [team_id],
        [room_id],
        saved_at=datetime(2026, 8, 1, 21, 0),
    )

    assert second.resolution.assignment.feasible is False
    assert second.saved is False
    after = {
        (row.room_id, row.team_id, row.starts_at, row.ends_at)
        for row in db_session.scalars(
            select(Assignment).where(Assignment.period_id == period_id)
        ).all()
    }
    assert after == before  # 실패한 재계산이 현행 시간표를 지우지 않았다


def test_unknown_period_is_rejected(db_session: Session) -> None:
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    with pytest.raises(ValueError, match="그런 기간이 없습니다"):
        assign_period(db_session, 999999, [team_id], [room_id], saved_at=SAVED_AT)


def test_team_without_members_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    empty_team = Team(name="빈팀")
    db_session.add(empty_team)
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    with pytest.raises(ValueError, match="멤버가 없습니다"):
        assign_period(
            db_session, period_id, [empty_team.id], [room_id], saved_at=SAVED_AT
        )


def test_overlapping_period_room_conflict_is_rejected_not_500(
    db_session: Session,
) -> None:
    """날짜가 겹치는 두 기간이 같은 방·같은 시각을 쓰면 (room_id, starts_at) 유니크
    제약에 걸린다 — 사용자가 만들 수 있는 상황이므로 500이 아니라 422(ValueError)로
    거부되어야 하고, 첫 번째 기간의 현행 시간표는 그대로 남아 있어야 한다."""
    period_a = _period(db_session)
    period_b = _period(db_session)
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "이영희")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    first = assign_period(
        db_session, period_a, [team_a], [room_id], saved_at=SAVED_AT
    )
    assert first.saved is True

    with pytest.raises(ValueError, match="이미"):
        assign_period(db_session, period_b, [team_b], [room_id], saved_at=SAVED_AT)

    remaining = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_a)
    ).all()
    assert len(remaining) == 2  # 첫 번째 기간의 현행 시간표가 그대로 남아 있다
    assert db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_b)
    ).all() == []


def test_duplicate_team_id_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    with pytest.raises(ValueError, match="팀"):
        assign_period(
            db_session, period_id, [team_id, team_id], [room_id], saved_at=SAVED_AT
        )


def test_duplicate_room_id_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(19, 0))

    with pytest.raises(ValueError, match="합주실"):
        assign_period(
            db_session, period_id, [team_id], [room_id, room_id], saved_at=SAVED_AT
        )


def test_two_week_schedule_for_four_teams_finishes(db_session: Session) -> None:
    """2주 × 방 2개 × 팀 4개 — 실제로 쓰일 만한 크기가 계산되는지 확인한다.

    계산 시간 자체는 단언하지 않는다(기계마다 다르다). 이 테스트가 도는 시간이
    곧 실측값이므로, `pytest --durations`로 확인해 문서에 적는다.
    """
    period = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 14),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    db_session.add(period)
    db_session.flush()

    team_ids = [
        _team_with_member(db_session, f"팀{index}", f"사람{index}")
        for index in range(4)
    ]
    room_ids = [
        _room(db_session, "1번방", time(18, 0), time(22, 0)),
        _room(db_session, "2번방", time(19, 0), time(22, 0)),
    ]

    result = assign_period(
        db_session, period.id, team_ids, room_ids, saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is True
    assert result.saved is True
