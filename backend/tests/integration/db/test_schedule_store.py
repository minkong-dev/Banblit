from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.models import Assignment, AssignmentBackup, Period, Room, Team
from backend.db.schedule_store import (
    AssignmentRow,
    rollback_schedule,
    save_schedule,
)


def _scaffold(session: Session) -> tuple[int, int, int]:
    """FK를 만족시킬 기간·팀·합주실을 하나씩 만들고 그 id를 돌려준다."""
    period = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 14),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    team = Team(name="A")
    room = Room(name="1번방", opens_at=time(18, 0), closes_at=time(22, 0))
    session.add_all([period, team, room])
    session.flush()
    return period.id, team.id, room.id


def _row(team_id: int, room_id: int, hour: int) -> AssignmentRow:
    """8월 1일 hour시 시작하는 30분짜리 배정 한 칸(현행/백업 공용 입력)."""
    return {
        "team_id": team_id,
        "room_id": room_id,
        "starts_at": datetime(2026, 8, 1, hour, 0),
        "ends_at": datetime(2026, 8, 1, hour, 30),
    }


def test_assignment_backup_round_trips(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    db_session.add(
        AssignmentBackup(
            period_id=period_id,
            team_id=team_id,
            room_id=room_id,
            starts_at=datetime(2026, 8, 1, 19, 0),
            ends_at=datetime(2026, 8, 1, 19, 30),
            saved_at=datetime(2026, 8, 1, 21, 0),
        )
    )
    db_session.commit()

    saved = db_session.scalars(select(AssignmentBackup)).one()
    assert saved.saved_at == datetime(2026, 8, 1, 21, 0)
    assert saved.starts_at == datetime(2026, 8, 1, 19, 0)


def test_first_save_writes_current_schedule(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)

    save_schedule(
        db_session,
        period_id,
        [_row(team_id, room_id, 19)],
        saved_at=datetime(2026, 8, 1, 21, 0),
    )
    db_session.commit()

    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 19, 0)]
    assert db_session.scalars(select(AssignmentBackup)).all() == []


def test_second_save_archives_previous(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)

    save_schedule(
        db_session, period_id, [_row(team_id, room_id, 19)],
        saved_at=datetime(2026, 8, 1, 9, 0),
    )
    db_session.commit()
    save_schedule(
        db_session, period_id, [_row(team_id, room_id, 20)],
        saved_at=datetime(2026, 8, 1, 21, 0),
    )
    db_session.commit()

    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 20, 0)]

    backups = db_session.scalars(select(AssignmentBackup)).all()
    assert [b.starts_at for b in backups] == [datetime(2026, 8, 1, 19, 0)]
    assert backups[0].saved_at == datetime(2026, 8, 1, 21, 0)


def test_backups_keep_only_two_most_recent(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)

    # 네 번 저장하면 백업 회차 3개(9:00·21:00·다음날 9:00)가 생기고,
    # 최신 2개만 남아야 한다.
    save_schedule(db_session, period_id, [_row(team_id, room_id, 18)],
                  saved_at=datetime(2026, 8, 1, 8, 0))
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 19)],
                  saved_at=datetime(2026, 8, 1, 9, 0))
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 20)],
                  saved_at=datetime(2026, 8, 1, 21, 0))
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 21)],
                  saved_at=datetime(2026, 8, 2, 9, 0))
    db_session.commit()

    saved_times = set(
        db_session.scalars(select(AssignmentBackup.saved_at).distinct()).all()
    )
    assert saved_times == {
        datetime(2026, 8, 1, 21, 0),
        datetime(2026, 8, 2, 9, 0),
    }


def test_rollback_restores_previous_schedule(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    save_schedule(db_session, period_id, [_row(team_id, room_id, 19)],
                  saved_at=datetime(2026, 8, 1, 9, 0))
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 20)],
                  saved_at=datetime(2026, 8, 1, 21, 0))
    db_session.commit()

    ok = rollback_schedule(db_session, period_id)
    db_session.commit()

    assert ok is True
    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 19, 0)]
    assert db_session.scalars(select(AssignmentBackup)).all() == []


def test_rollback_after_third_save_leaves_older_backup_intact(
    db_session: Session,
) -> None:
    """세 번째 저장(s3) 뒤 롤백 1회는 s2로 되돌리고, s2 백업 회차만 남겨야 한다.

    s1은 아카이브할 현행이 없어 백업을 만들지 않으므로 회차는 s2·s3 두 개다.
    이 상태에서 롤백하면 최신 회차(s3)만 지워지고 s2는 그대로 살아있어야 한다.
    """
    period_id, team_id, room_id = _scaffold(db_session)

    save_schedule(db_session, period_id, [_row(team_id, room_id, 18)],
                  saved_at=datetime(2026, 8, 1, 8, 0))  # s1
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 19)],
                  saved_at=datetime(2026, 8, 1, 9, 0))  # s2
    db_session.commit()
    save_schedule(db_session, period_id, [_row(team_id, room_id, 20)],
                  saved_at=datetime(2026, 8, 1, 21, 0))  # s3
    db_session.commit()

    backups_before = db_session.scalars(select(AssignmentBackup)).all()
    assert len(backups_before) == 2
    assert {b.saved_at for b in backups_before} == {
        datetime(2026, 8, 1, 9, 0),
        datetime(2026, 8, 1, 21, 0),
    }

    ok = rollback_schedule(db_session, period_id)
    db_session.commit()

    assert ok is True
    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 19, 0)]

    remaining = db_session.scalars(select(AssignmentBackup)).all()
    assert len(remaining) == 1
    assert remaining[0].saved_at == datetime(2026, 8, 1, 9, 0)
    assert remaining[0].starts_at == datetime(2026, 8, 1, 18, 0)


def test_rollback_without_backup_returns_false(db_session: Session) -> None:
    period_id, team_id, room_id = _scaffold(db_session)
    save_schedule(db_session, period_id, [_row(team_id, room_id, 19)],
                  saved_at=datetime(2026, 8, 1, 9, 0))
    db_session.commit()

    ok = rollback_schedule(db_session, period_id)
    db_session.commit()

    assert ok is False
    current = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_id)
    ).all()
    assert [a.starts_at for a in current] == [datetime(2026, 8, 1, 19, 0)]


def test_two_periods_do_not_interfere(db_session: Session) -> None:
    """서로 다른 기간의 저장·프루닝·롤백은 다른 기간의 현행·백업을 건드리지 않는다."""
    period1_id, team1_id, room1_id = _scaffold(db_session)

    period2 = Period(
        kind="focused",
        starts_on=date(2026, 8, 1),
        ends_on=date(2026, 8, 14),
        everyday=False,
        first_run_at=time(9, 0),
        second_run_at=time(21, 0),
    )
    team2 = Team(name="B")
    room2 = Room(name="2번방", opens_at=time(18, 0), closes_at=time(22, 0))
    db_session.add_all([period2, team2, room2])
    db_session.flush()
    period2_id, team2_id, room2_id = period2.id, team2.id, room2.id

    # period1: 두 번 저장해 백업 회차 1개(saved_at=8/1 23:00)를 만들어둔다.
    # 이 saved_at은 아래 period2의 백업 saved_at들(9:00·21:00·22:00)과
    # 절대 겹치지 않게 잡는다 — 프루닝이 period_id를 무시하면 period2의
    # keep 목록에 없다는 이유로 이 회차가 잘못 지워지는 것을 검증하기 위해서다.
    save_schedule(db_session, period1_id, [_row(team1_id, room1_id, 10)],
                  saved_at=datetime(2026, 8, 1, 7, 0))
    db_session.commit()
    save_schedule(db_session, period1_id, [_row(team1_id, room1_id, 11)],
                  saved_at=datetime(2026, 8, 1, 23, 0))
    db_session.commit()

    # period2: 네 번 저장해 프루닝을 실제로 일으킨 뒤 롤백까지 수행한다.
    # (1번째 저장은 아카이브할 현행이 없어 백업을 만들지 않으므로, 백업 회차가
    # 3개(9:00·21:00·22:00)가 되는 4번째 저장에서야 BACKUP_KEEP=2를 넘겨
    # 가장 오래된 회차(9:00)가 실제로 지워진다.)
    save_schedule(db_session, period2_id, [_row(team2_id, room2_id, 18)],
                  saved_at=datetime(2026, 8, 1, 8, 0))
    db_session.commit()
    save_schedule(db_session, period2_id, [_row(team2_id, room2_id, 19)],
                  saved_at=datetime(2026, 8, 1, 9, 0))
    db_session.commit()
    save_schedule(db_session, period2_id, [_row(team2_id, room2_id, 20)],
                  saved_at=datetime(2026, 8, 1, 21, 0))
    db_session.commit()
    save_schedule(db_session, period2_id, [_row(team2_id, room2_id, 17)],
                  saved_at=datetime(2026, 8, 1, 22, 0))
    db_session.commit()
    ok = rollback_schedule(db_session, period2_id)
    db_session.commit()
    assert ok is True

    # period1의 현행·백업은 위 period2 작업 전 상태 그대로여야 한다.
    current1 = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period1_id)
    ).all()
    assert [a.starts_at for a in current1] == [datetime(2026, 8, 1, 11, 0)]
    backups1 = db_session.scalars(
        select(AssignmentBackup).where(AssignmentBackup.period_id == period1_id)
    ).all()
    assert [b.saved_at for b in backups1] == [datetime(2026, 8, 1, 23, 0)]
    assert [b.starts_at for b in backups1] == [datetime(2026, 8, 1, 10, 0)]

    # period2도 자신의 저장·프루닝·롤백 결과대로 정상 동작해야 한다.
    # 4번째 저장에서 9:00 회차가 프루닝으로 지워졌고, 롤백은 최신 회차(22:00,
    # starts_at 20:00)를 현행으로 되돌린 뒤 그 회차를 지운다 — 남는 백업은
    # 21:00(starts_at 19:00) 하나다.
    current2 = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period2_id)
    ).all()
    assert [a.starts_at for a in current2] == [datetime(2026, 8, 1, 20, 0)]
    backups2 = db_session.scalars(
        select(AssignmentBackup).where(AssignmentBackup.period_id == period2_id)
    ).all()
    assert [b.saved_at for b in backups2] == [datetime(2026, 8, 1, 21, 0)]
    assert [b.starts_at for b in backups2] == [datetime(2026, 8, 1, 19, 0)]
