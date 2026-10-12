from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup, Period, Room, Team
from backend.db.schedule_store import (
    RECORD_KEEP,
    AssignmentRow,
    apply_record,
    list_backup_rounds,
    save_record,
    save_schedule,
)


def _scaffold(session: Session) -> tuple[int, int, int]:
    """FK를 만족시킬 기간·팀·합주실을 하나씩 생성하고 그 id를 반환합니다."""
    period = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 14),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(23, 0))
    session.add_all([period, team, room])
    session.flush()
    return period.id, team.id, room.id


def _row(team_id: int, room_id: int, hour: int) -> AssignmentRow:
    """8월 1일 hour시 시작하는 한 시간짜리 배정 행을 반환합니다(현행/기록 공용 입력)."""
    return {
        "team_id": team_id,
        "room_id": room_id,
        "starts_at": datetime(2026, 8, 1, hour, 0),
        "ends_at": datetime(2026, 8, 1, hour + 1),
    }


def _current(session: Session, period_id: int) -> list[datetime]:
    return sorted(
        session.scalars(select(Assignment.starts_at).where(Assignment.period_id == period_id)).all()
    )


def _record_times(session: Session, period_id: int) -> list[datetime]:
    return [r["saved_at"] for r in list_backup_rounds(session, period_id, slot_minutes=60)]


def test_assignment_backup_round_trips(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    db_session.add(
        AssignmentBackup(
            period_id=period_id,
            team_id=team_id,
            room_id=room_id,
            starts_at=datetime(2026, 8, 1, 19, 0),
            ends_at=datetime(2026, 8, 1, 20),
            saved_at=datetime(2026, 8, 1, 21, 0),
        )
    )
    db_session.commit()

    saved = db_session.scalars(select(AssignmentBackup)).one()
    assert saved.saved_at == datetime(2026, 8, 1, 21, 0)
    assert saved.starts_at == datetime(2026, 8, 1, 19, 0)


def test_save_schedule_replaces_the_current_schedule_without_making_a_record(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)

    save_schedule(db_session, period_id, [_row(team_id, room_id, 19)])
    save_schedule(db_session, period_id, [_row(team_id, room_id, 20)])

    assert _current(db_session, period_id) == [datetime(2026, 8, 1, 20, 0)]
    assert db_session.scalars(select(AssignmentBackup)).all() == []


def test_consecutive_slots_become_one_row(db_session: Session) -> None:
    """같은 팀이 같은 합주실에서 이어 쓰는 칸은 구간 한 행으로 저장합니다."""
    period_id, team_id, room_id = _scaffold(db_session)

    save_schedule(
        db_session,
        period_id,
        [_row(team_id, room_id, 19), _row(team_id, room_id, 20), _row(team_id, room_id, 21)],
    )

    current = db_session.scalars(select(Assignment).where(Assignment.period_id == period_id)).all()
    assert [(a.starts_at, a.ends_at) for a in current] == [
        (datetime(2026, 8, 1, 19, 0), datetime(2026, 8, 1, 22, 0))
    ]


def test_a_gap_between_slots_keeps_two_rows(db_session: Session) -> None:
    """떨어진 칸은 잇지 않습니다. 이으면 배정받지 않은 시간까지 점유한 것이 됩니다."""
    period_id, team_id, room_id = _scaffold(db_session)

    save_schedule(db_session, period_id, [_row(team_id, room_id, 19), _row(team_id, room_id, 21)])

    assert _current(db_session, period_id) == [datetime(2026, 8, 1, 19, 0), datetime(2026, 8, 1, 21, 0)]


def test_different_teams_are_not_joined(db_session: Session) -> None:
    """이어진 칸이라도 팀이 다르면 각각의 행입니다."""
    period_id, team_id, room_id = _scaffold(db_session)
    other = Team(name="B")
    db_session.add(other)
    db_session.flush()

    save_schedule(db_session, period_id, [_row(team_id, room_id, 19), _row(other.id, room_id, 20)])

    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id).order_by(Assignment.starts_at)
    ).all()
    assert [(a.team_id, a.starts_at, a.ends_at) for a in current] == [
        (team_id, datetime(2026, 8, 1, 19, 0), datetime(2026, 8, 1, 20, 0)),
        (other.id, datetime(2026, 8, 1, 20, 0), datetime(2026, 8, 1, 21, 0)),
    ]


def test_a_record_leaves_the_current_schedule_alone(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    save_schedule(db_session, period_id, [_row(team_id, room_id, 18)])

    save_record(db_session, period_id, [_row(team_id, room_id, 20)], saved_at=datetime(2026, 8, 1, 9, 0))

    assert _current(db_session, period_id) == [datetime(2026, 8, 1, 18, 0)]
    assert _record_times(db_session, period_id) == [datetime(2026, 8, 1, 9, 0)]


def test_records_are_listed_newest_first_with_their_slot_counts(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    save_record(db_session, period_id, [_row(team_id, room_id, 19)], saved_at=datetime(2026, 8, 2, 21, 0))
    save_record(
        db_session,
        period_id,
        [_row(team_id, room_id, 19), _row(team_id, room_id, 20)],
        saved_at=datetime(2026, 8, 3, 21, 0),
    )

    assert list_backup_rounds(db_session, period_id, slot_minutes=60) == [
        {"saved_at": datetime(2026, 8, 3, 21, 0), "slot_count": 2},
        {"saved_at": datetime(2026, 8, 2, 21, 0), "slot_count": 1},
    ]


def test_only_the_most_recent_records_are_kept(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    hours = range(RECORD_KEEP + 1)
    for hour in hours:
        save_record(db_session, period_id, [_row(team_id, room_id, 18)], saved_at=datetime(2026, 8, 2, hour, 0))

    times = _record_times(db_session, period_id)

    assert len(times) == RECORD_KEEP
    assert datetime(2026, 8, 2, 0, 0) not in times


def test_applying_a_record_replaces_the_current_schedule_and_keeps_the_record(db_session: Session) -> None:
    # 기록은 쌓기만 합니다(사용자 결정 2026-10-13). 적용한 기록도 목록에 남아 다시 적용할 수 있습니다.
    period_id, team_id, room_id = _scaffold(db_session)
    save_schedule(db_session, period_id, [_row(team_id, room_id, 18)])
    save_record(db_session, period_id, [_row(team_id, room_id, 20)], saved_at=datetime(2026, 8, 1, 9, 0))

    applied = apply_record(db_session, period_id, datetime(2026, 8, 1, 9, 0))

    assert applied is True
    assert _current(db_session, period_id) == [datetime(2026, 8, 1, 20, 0)]
    assert _record_times(db_session, period_id) == [datetime(2026, 8, 1, 9, 0)]


def test_applying_a_missing_record_changes_nothing(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    save_schedule(db_session, period_id, [_row(team_id, room_id, 18)])

    assert apply_record(db_session, period_id, datetime(2026, 8, 1, 9, 0)) is False
    assert _current(db_session, period_id) == [datetime(2026, 8, 1, 18, 0)]


def test_pruning_one_period_keeps_the_other_periods_records(db_session: Session) -> None:
    period1_id, team1_id, room1_id = _scaffold(db_session)
    # 집중 합주기간끼리 날짜가 겹칠 수 없어(migration b5e1d9a37c42) period1(8/1~8/14) 뒤에 둡니다.
    period2 = Period(
        kind="focused",
        starts_on=date(2026, 8, 15),
        ends_on=date(2026, 8, 28),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    team2 = Team(name="B")
    room2 = Room(name="2번방", opens_at=time(18, 0), closes_at=time(23, 0))
    db_session.add_all([period2, team2, room2])
    db_session.flush()
    # period1 의 기록은 period2 의 어느 기록보다 오래되었습니다. _prune_backups 가 period_id 를 무시하면 삭제됩니다.
    save_record(db_session, period1_id, [_row(team1_id, room1_id, 10)], saved_at=datetime(2026, 8, 1, 0, 0))
    for hour in range(1, RECORD_KEEP + 2):
        save_record(db_session, period2.id, [_row(team2.id, room2.id, 18)], saved_at=datetime(2026, 8, 2, hour, 0))

    assert _record_times(db_session, period1_id) == [datetime(2026, 8, 1, 0, 0)]
    assert len(_record_times(db_session, period2.id)) == RECORD_KEEP
