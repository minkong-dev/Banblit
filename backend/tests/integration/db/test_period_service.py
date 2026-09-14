from datetime import date, datetime, time, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.period_service import assign_period, open_slots_in_period
from backend.scheduling.slots import DEFAULT_SLOT_MINUTES
from backend.db.models import (
    Assignment,
    AssignmentBackup,
    Member,
    Period,
    Room,
    Team,
    TeamSlot,
    UnavailableTime,
)
from conftest import seat

SAVED_AT = datetime(2026, 8, 1, 9, 0)


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
    seat(session, team.id, member.id)
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
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))  # 2개 slot

    result = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is True
    assert result.saved is True
    saved = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert len(saved) == 2  # 팀 하나가 전체 2개 slot을 배정받습니다.
    assert {row.room_id for row in saved} == {room_id}
    assert {row.team_id for row in saved} == {team_id}


def test_successful_assignment_round_trips_rooms_teams_and_times(
    db_session: Session,
) -> None:
    """합주실 2개(운영시간이 다름)·팀 2개·2일 기간으로 배정 왕복을 구체값까지 확인합니다."""
    period_id = _period(db_session, days=2)  # 8/1 ~ 8/2
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "박지훈")
    room_1 = _room(db_session, "1번방", time(18, 0), time(20, 0))  # 하루 2개 slot
    room_2 = _room(db_session, "2번방", time(20, 0), time(22, 0))  # 하루 2개 slot, 다른 시간대

    result = assign_period(
        db_session, period_id, [team_a, team_b], [room_1, room_2], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is True
    assert result.saved is True
    saved = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()

    # 하루 4개 slot(합주실 2개 × 2개 slot) × 2일 = 8개 slot, 팀 2개가 4개 slot씩 배정받습니다.
    assert len(saved) == 8

    operating_hours = {
        room_1: (time(18, 0), time(20, 0)),
        room_2: (time(20, 0), time(22, 0)),
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
    # 두 번째 멤버를 추가하고 그 멤버만 운영시간 내내 불가능하게 설정합니다.
    other = Member(name="이영희")
    db_session.add(other)
    db_session.flush()
    seat(db_session, team_id, other.id)
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
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    result = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is False
    assert result.saved is False
    assert db_session.scalars(select(Assignment)).all() == []
    excluded = [
        result.member_names[p.excluded_member] for p in result.resolution.proposals
    ]
    assert excluded == ["이영희"]


def test_open_period_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session, kind="open")
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="집중"):
        assign_period(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)


def test_unknown_team_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

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
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    assign_period(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)
    assign_period(
        db_session,
        period_id,
        [team_id],
        [room_id],
        saved_at=datetime(2026, 8, 1, 21, 0),
    )

    backups = db_session.scalars(select(AssignmentBackup)).all()
    assert len(backups) == 2  # 첫 배정기록의 2칸이 백업으로 옮겨졌다
    assert {b.saved_at for b in backups} == {datetime(2026, 8, 1, 21, 0)}


def test_failed_reassignment_preserves_the_current_schedule(
    db_session: Session,
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

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

    # 유일한 멤버를 운영시간 내내 불가능하게 만들어 재계산을 불가능하게 합니다.
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
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="그런 기간이 없습니다"):
        assign_period(db_session, 999999, [team_id], [room_id], saved_at=SAVED_AT)


def test_team_without_members_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    empty_team = Team(name="빈팀")
    db_session.add(empty_team)
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="멤버가 없습니다"):
        assign_period(
            db_session, period_id, [empty_team.id], [room_id], saved_at=SAVED_AT
        )


def test_overlapping_period_room_conflict_is_rejected_not_500(
    db_session: Session,
) -> None:
    """날짜가 겹치는 두 기간이 같은 합주실·같은 시각을 사용하면 (room_id, starts_at) unique
    제약을 위반합니다. 사용자가 만들 수 있는 상황이므로 500 이 아니라 422(ValueError)로
    거부되어야 하고, 첫 번째 기간의 현행 시간표는 그대로 남아 있어야 합니다."""
    period_a = _period(db_session)
    period_b = _period(db_session)
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "이영희")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

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
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="팀"):
        assign_period(
            db_session, period_id, [team_id, team_id], [room_id], saved_at=SAVED_AT
        )


def test_duplicate_room_id_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="합주실"):
        assign_period(
            db_session, period_id, [team_id], [room_id, room_id], saved_at=SAVED_AT
        )


def test_two_week_schedule_for_four_teams_finishes(db_session: Session) -> None:
    """2주 × 합주실 2개 × 팀 4개, 실제 운영 규모의 입력이 계산되는지 확인합니다.

    계산 시간 자체는 assert 하지 않습니다(PC 마다 다릅니다). 이 테스트의 실행 시간이
    곧 실측값이므로, `pytest --durations` 로 확인해 문서에 적습니다.
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
        _room(db_session, "1번방", time(18, 0), time(23, 0)),
        _room(db_session, "2번방", time(19, 0), time(23, 0)),
    ]

    result = assign_period(
        db_session, period.id, team_ids, room_ids, saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is True
    assert result.saved is True




def test_unavailable_time_on_the_last_day_of_the_period_blocks_assignment(
    db_session: Session,
) -> None:
    """기간 마지막 날(둘째 날)에 있는 불가능 시간도 첫날과 같게 배정을 막아야 합니다.

    기간의 끝을 시작일 기준으로 계산하면(예: window_end 를 starts_on 으로 잡으면)
    둘째 날의 불가능 시간이 기간 밖으로 판정되어 전부 제외됩니다. 그러면 이영희가
    항상 가능한 것으로 처리되어, 조율안 없이 배정에 성공합니다.
    """
    period_id = _period(db_session, days=2)  # 8/1 ~ 8/2
    team_id = _team_with_member(db_session, "A", "김민수")
    other = Member(name="이영희")
    db_session.add(other)
    db_session.flush()
    seat(db_session, team_id, other.id)
    # 마지막 날(8/2)에만 있는 불가능 시간입니다. 첫날(8/1)에는 제약이 없습니다.
    db_session.add(
        UnavailableTime(
            member_id=other.id,
            starts_at=datetime(2026, 8, 2, 18, 0),
            ends_at=datetime(2026, 8, 2, 19, 0),
            repeats_weekly=False,
            repeat_until=None,
        )
    )
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))  # 하루 2칸 × 2일 = 4칸

    result = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is False
    assert result.saved is False
    excluded = [
        result.member_names[p.excluded_member] for p in result.resolution.proposals
    ]
    assert excluded == ["이영희"]


def test_multiple_unavailable_times_for_the_same_person_all_block_assignment(
    db_session: Session,
) -> None:
    """한 사람에게 불가능 시간이 2개 이상이면 전부 반영되어야 합니다.

    첫 번째 불가능 시간만 반영하면(예: expand_unavailable 이 rows 의 첫 원소만 사용하면) 두 번째
    구간이 가능한 시간으로 처리되어, 실제로는 불가능한 배정을 가능하다고 잘못 판정합니다.

    설계: 합주실은 하루 2칸(18:00~20:00, 1시간 격자). 팀 A(김민수, 항상 가능)와
    팀 B(이영희 혼자)가 각각 2칸씩 나눠 갖는다(총 4칸 / 팀 2개). 이영희에게
    18:00~19:00, 19:00~19:30 두 구간을 따로따로 걸어 두면 그녀가 갈 수 있는
    칸은 19:30~20:00 하나뿐이라 2칸을 채울 수 없어 반드시 infeasible이어야
    한다. 앞의 구간(18:00~19:00) 하나만 반영되면 19:00~20:00 두 칸이 남아
    2칸을 정확히 채울 수 있어 feasible이 되어 버린다 — 그 차이로 결함을 잡는다.
    """
    period_id = _period(db_session)  # 8/1 하루
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "이영희")
    room_id = _room(db_session, "1번방", time(18, 0), time(22, 0))  # 하루 4칸

    member_id = db_session.scalars(
        select(Member.id).where(Member.name == "이영희")
    ).one()
    db_session.add_all(
        [
            UnavailableTime(
                member_id=member_id,
                starts_at=datetime(2026, 8, 1, 18, 0),
                ends_at=datetime(2026, 8, 1, 20, 0),
                repeats_weekly=False,
                repeat_until=None,
            ),
            UnavailableTime(
                member_id=member_id,
                starts_at=datetime(2026, 8, 1, 20, 0),
                ends_at=datetime(2026, 8, 1, 22, 0),
                repeats_weekly=False,
                repeat_until=None,
            ),
        ]
    )
    db_session.flush()

    result = assign_period(
        db_session, period_id, [team_a, team_b], [room_id], saved_at=SAVED_AT
    )

    assert result.resolution.assignment.feasible is False
    assert result.saved is False


def test_excluding_the_proposed_member_makes_the_assignment_savable(
    db_session: Session,
) -> None:
    """조율안 확정 경로입니다. 조율안이 지목한 멤버를 제외하면 그 결과가 현행 시간표가 됩니다."""
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    blocked = Member(name="이영희")
    db_session.add(blocked)
    db_session.flush()
    seat(db_session, team_id, blocked.id)
    db_session.add(
        UnavailableTime(
            member_id=blocked.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            repeats_weekly=False,
            repeat_until=None,
        )
    )
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    refused = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )
    assert refused.saved is False

    result = assign_period(
        db_session,
        period_id,
        [team_id],
        [room_id],
        saved_at=SAVED_AT,
        excluded_member_id=blocked.id,
    )

    assert result.resolution.assignment.feasible is True
    assert result.saved is True
    saved = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert len(saved) == 2  # 팀 하나가 전체 2칸을 가져간다


def test_excluding_someone_outside_the_roster_is_rejected(
    db_session: Session,
) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="명단에 없습니다"):
        assign_period(
            db_session,
            period_id,
            [team_id],
            [room_id],
            saved_at=SAVED_AT,
            excluded_member_id=999999,
        )


def test_open_slots_come_from_the_saved_schedule_without_recomputing(
    db_session: Session,
) -> None:
    """남는 slot 은 저장된 배정에서 조회합니다. 배정 계산을 다시 실행하지 않습니다."""
    period_id = _period(db_session)  # 8/1 하루
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "박지훈")
    room_id = _room(db_session, "1번방", time(18, 0), time(21, 0))  # 3칸

    result = assign_period(
        db_session, period_id, [team_a, team_b], [room_id], saved_at=SAVED_AT
    )
    assert result.saved is True
    assert len(result.resolution.assignment.open_slots) == 1  # 3칸 - 팀당 1칸 × 2팀

    period = db_session.get(Period, period_id)
    assert period is not None
    left_open = open_slots_in_period(db_session, period)

    assert len(left_open) == 1
    assert left_open[0].room_id == room_id
    assert left_open[0].room == "1번방"
    assert left_open[0].end - left_open[0].start == timedelta(minutes=DEFAULT_SLOT_MINUTES)


def test_open_slots_are_empty_when_nothing_is_assigned(db_session: Session) -> None:
    period_id = _period(db_session)
    _room(db_session, "1번방", time(18, 0), time(20, 0))
    db_session.flush()

    period = db_session.get(Period, period_id)
    assert period is not None
    assert open_slots_in_period(db_session, period) == []


def test_an_everyday_period_assigns_only_the_day_of_the_run(db_session: Session) -> None:
    """everyday 기간은 종료일이 없으므로 기간 전체가 아니라 계산을 실행한 날 하루만 배정합니다."""
    period_id = _period(db_session, days=3)  # 8/1 ~ 8/3
    db_session.get(Period, period_id).everyday = True
    db_session.flush()
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))
    db_session.commit()

    result = assign_period(
        db_session, period_id, [team_id], [room_id], saved_at=datetime(2026, 8, 5, 9, 0)
    )

    assert result.saved is True
    rows = db_session.scalars(select(Assignment)).all()
    assert {row.starts_at.date() for row in rows} == {date(2026, 8, 5)}
