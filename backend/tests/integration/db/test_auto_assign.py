from datetime import date, datetime, time, timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.jobs import auto_assign
from backend.db.models import Assignment, AssignmentRun, Member, Period, Room, Team, TeamSlot

TODAY = date(2026, 8, 10)
FIRST_RUN_AT = time(9, 0)
SECOND_RUN_AT = time(21, 0)


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime.combine(TODAY, time(hour, minute))


def _period(
    session: Session,
    starts_on: date = TODAY,
    ends_on: date = TODAY,
    kind: str = "focused",
) -> int:
    period = Period(
        kind=kind,
        starts_on=starts_on,
        ends_on=ends_on,
        everyday=False,
        first_run_at=FIRST_RUN_AT,
        second_run_at=SECOND_RUN_AT,
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
        TeamSlot(team_id=team.id, instrument="보컬", ordinal=1, member_id=member.id)
    )
    session.flush()
    return team.id


def _room(session: Session, name: str) -> int:
    room = Room(name=name, opens_at=time(18, 0), closes_at=time(20, 0))  # 2칸
    session.add(room)
    session.flush()
    return room.id


def _runs(session: Session) -> list[AssignmentRun]:
    return list(
        session.scalars(select(AssignmentRun).order_by(AssignmentRun.slot)).all()
    )


def _assignments(session: Session) -> list[Assignment]:
    return list(session.scalars(select(Assignment)).all())


def _count_assign_calls(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    # assign_period 를 감싸 호출 횟수만 센다. 계산 자체는 원본이 그대로 한다.
    calls: list[int] = []
    real = auto_assign.assign_period

    def counting(*args: Any, **kwargs: Any) -> Any:
        calls.append(kwargs["period_id"] if "period_id" in kwargs else args[1])
        return real(*args, **kwargs)

    monkeypatch.setattr(auto_assign, "assign_period", counting)
    return calls


def test_runs_the_slot_whose_time_has_passed(db_session: Session) -> None:
    period_id = _period(db_session)
    _team_with_member(db_session, "A", "김민수")
    _room(db_session, "1번방")

    results = auto_assign.run_due_assignments(db_session, _at(10))

    assert [result.period_id for result in results] == [period_id]
    assert results[0].error is None
    assert results[0].saved is True
    assert len(_assignments(db_session)) == 2
    assert [(run.period_id, run.run_on, run.slot) for run in _runs(db_session)] == [
        (period_id, TODAY, "first")
    ]


def test_does_not_run_before_the_time(db_session: Session) -> None:
    _period(db_session)
    _team_with_member(db_session, "A", "김민수")
    _room(db_session, "1번방")

    assert auto_assign.run_due_assignments(db_session, _at(8)) == []
    assert _assignments(db_session) == []
    assert _runs(db_session) == []


def test_does_not_run_a_slot_that_already_ran(db_session: Session) -> None:
    period_id = _period(db_session)
    _team_with_member(db_session, "A", "김민수")
    _room(db_session, "1번방")
    db_session.add(
        AssignmentRun(
            period_id=period_id, run_on=TODAY, slot="first", ran_at=_at(9, 1)
        )
    )
    db_session.commit()

    assert auto_assign.run_due_assignments(db_session, _at(10)) == []
    assert _assignments(db_session) == []
    assert len(_runs(db_session)) == 1


def test_runs_once_when_both_slots_of_today_are_overdue(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    period_id = _period(db_session)
    _team_with_member(db_session, "A", "김민수")
    _room(db_session, "1번방")
    calls = _count_assign_calls(monkeypatch)

    results = auto_assign.run_due_assignments(db_session, _at(22))

    assert calls == [period_id]  # 같은 계산을 두 번 하지 않는다
    assert results[0].slots == ("first", "second")
    assert {run.slot for run in _runs(db_session)} == {"first", "second"}


def test_does_not_run_a_slot_missed_yesterday(db_session: Session) -> None:
    _period(db_session, starts_on=TODAY - timedelta(days=1), ends_on=TODAY)
    _team_with_member(db_session, "A", "김민수")
    _room(db_session, "1번방")

    # 어제 두 시각이 다 지났지만 오늘 9시는 아직 안 됐다 — 소급은 오늘까지만이다.
    assert auto_assign.run_due_assignments(db_session, _at(8)) == []
    assert _runs(db_session) == []


def test_skips_periods_that_do_not_contain_today(db_session: Session) -> None:
    _period(
        db_session,
        starts_on=TODAY - timedelta(days=7),
        ends_on=TODAY - timedelta(days=1),
    )
    _team_with_member(db_session, "A", "김민수")
    _room(db_session, "1번방")

    assert auto_assign.run_due_assignments(db_session, _at(10)) == []
    assert _runs(db_session) == []


def test_a_failing_period_does_not_stop_the_next_one(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    broken_id = _period(db_session)
    healthy_id = _period(db_session)
    _team_with_member(db_session, "A", "김민수")
    _room(db_session, "1번방")
    # 실패한 기간은 되돌리기(rollback)로 자기 작업만 버린다. 실제 저장소의 기간은
    # 이미 커밋된 줄이므로, 검사도 심어둔 것을 커밋해 같은 조건으로 맞춘다.
    db_session.commit()
    real = auto_assign.assign_period

    def failing_for_the_first_period(*args: Any, **kwargs: Any) -> Any:
        if args[1] == broken_id:
            raise RuntimeError("계산이 터졌다")
        return real(*args, **kwargs)

    monkeypatch.setattr(auto_assign, "assign_period", failing_for_the_first_period)

    results = auto_assign.run_due_assignments(db_session, _at(10))

    assert [result.period_id for result in results] == [broken_id, healthy_id]
    assert results[0].error is not None
    assert results[1].error is None
    # 터진 기간은 표시를 남기지 않아 다음 확인 때 다시 시도된다.
    assert [(run.period_id, run.slot) for run in _runs(db_session)] == [
        (healthy_id, "first")
    ]
    assert len(_assignments(db_session)) == 2
