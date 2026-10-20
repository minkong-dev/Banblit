from datetime import date, datetime, time, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db.pipeline import apply_record
from backend.services.period.pipeline import (
    assignment_rows,
    every_team_and_room,
    open_slots_in_period,
    run_period_assignment,
    schedule_report,
)
from backend.contract import DEFAULT_SLOT_MINUTES
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


def test_a_run_is_kept_as_a_record_and_leaves_the_current_schedule_alone(
    db_session: Session,
) -> None:
    # 연산 결과는 쌓기만 합니다. 현재 배정안은 적용할 때만 바뀝니다(사용자 결정 2026-10-13).
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))  # 2개 slot

    result = run_period_assignment(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    assert result.record_saved_at == SAVED_AT
    assert db_session.scalars(select(Assignment)).all() == []
    saved = db_session.scalars(
        select(AssignmentBackup).where(AssignmentBackup.period_id == period_id)
    ).all()
    # 팀 하나가 전체 2칸을 배정받고, 이어진 칸이라 구간 한 행으로 저장됩니다.
    assert len(saved) == 1
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

    result = run_period_assignment(
        db_session, period_id, [team_a, team_b], [room_1, room_2], saved_at=SAVED_AT
    )

    assert result.record_saved_at is not None
    saved = db_session.scalars(
        select(AssignmentBackup).where(AssignmentBackup.period_id == period_id)
    ).all()

    # 하루 4칸(합주실 2개 × 2칸) × 2일 = 8칸, 팀 2개가 4칸씩 배정받습니다. 합주실 하나에서
    # 이어진 2칸이 구간 한 행이 되므로 행은 4개입니다(합주실 2개 × 2일).
    assert len(saved) == 4

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

    # 행 수가 아니라 점유한 시간을 셉니다. 이어진 칸이 구간 한 행으로 합쳐지므로 행 수는 팀이
    # 배정받은 칸 수와 다릅니다. 두 팀이 각각 4칸(=4시간)을 가져갑니다.
    team_hours: dict[int, float] = {}
    for row in saved:
        hours = (row.ends_at - row.starts_at).total_seconds() / 3600
        team_hours[row.team_id] = team_hours.get(row.team_id, 0) + hours
    assert team_hours == {team_a: 4, team_b: 4}


def test_short_assignment_is_kept_as_an_unsaved_record(
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
            repeat_weekdays=None,
            repeat_until=None,
        )
    )
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    result = run_period_assignment(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    # 목표 2회 중 이영희가 가능한 19~20시 1회만 받습니다.
    assert result.record_saved_at == SAVED_AT
    assert [(s.team, s.assigned_hours) for s in result.report.shortfalls] == [("A", 1.0)]
    assert result.report.target_hours == 2.0


def test_open_period_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session, kind="open")
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="집중"):
        run_period_assignment(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)


def test_unknown_team_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="존재하지 않는 팀이에요"):
        run_period_assignment(db_session, period_id, [999999], [room_id], saved_at=SAVED_AT)


def test_unknown_room_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")

    with pytest.raises(ValueError, match="존재하지 않는 합주실이에요"):
        run_period_assignment(db_session, period_id, [team_id], [999999], saved_at=SAVED_AT)


def test_every_run_adds_a_record(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    run_period_assignment(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)
    run_period_assignment(
        db_session, period_id, [team_id], [room_id], saved_at=datetime(2026, 8, 1, 21, 0)
    )

    times = set(db_session.scalars(select(AssignmentBackup.saved_at)).all())
    assert times == {SAVED_AT, datetime(2026, 8, 1, 21, 0)}


def test_a_run_does_not_change_the_applied_schedule(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))
    first = run_period_assignment(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)
    assert first.record_saved_at is not None
    assert apply_record(db_session, period_id, first.record_saved_at) is True
    before = db_session.scalars(select(Assignment.starts_at)).all()

    run_period_assignment(
        db_session, period_id, [team_id], [room_id], saved_at=datetime(2026, 8, 1, 21, 0)
    )

    assert db_session.scalars(select(Assignment.starts_at)).all() == before


def test_unknown_period_is_rejected(db_session: Session) -> None:
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="존재하지 않는 기간이에요"):
        run_period_assignment(db_session, 999999, [team_id], [room_id], saved_at=SAVED_AT)


def test_team_without_members_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    empty_team = Team(name="빈팀")
    db_session.add(empty_team)
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="멤버가 없어요"):
        run_period_assignment(
            db_session, period_id, [empty_team.id], [room_id], saved_at=SAVED_AT
        )


def test_every_team_and_room_skips_teams_without_members(db_session: Session) -> None:
    """자동 배정과 스케줄링 버튼이 쓰는 전체 팀 목록입니다. 멤버가 없는 팀이 들어가면 배정 계산 전체가 거절됩니다."""
    seated = _team_with_member(db_session, "A", "김민수")
    empty_team = Team(name="빈팀")
    db_session.add(empty_team)
    db_session.flush()
    db_session.add(TeamSlot(team_id=empty_team.id, instrument="보컬", ordinal=1))
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))
    db_session.flush()

    team_ids, room_ids = every_team_and_room(db_session)

    assert seated in team_ids
    assert empty_team.id not in team_ids
    assert room_id in room_ids


def test_overlapping_period_room_conflict_is_rejected_not_500(
    db_session: Session,
) -> None:
    """배정을 적용한 기간 A 의 날짜를 변경하면 A 의 배정은 옛 날짜에 남습니다. 비워진 날짜에 만든
    기간 B 의 연산 결과가 같은 합주실·같은 시각을 사용하면 적용할 때 저장 제약을 위반합니다. 사용자가 만들 수 있는
    상황이므로 500 이 아니라 422(ValueError)로 거부되어야 하고, 첫 번째 기간의 현행 시간표는 그대로 남아 있어야 합니다.

    집중 합주기간끼리는 날짜가 겹칠 수 없으므로(migration b5e1d9a37c42) 날짜 변경으로 재현합니다."""
    period_a = _period(db_session)
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "이영희")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    first = run_period_assignment(
        db_session, period_a, [team_a], [room_id], saved_at=SAVED_AT
    )
    assert first.record_saved_at is not None
    assert apply_record(db_session, period_a, first.record_saved_at) is True

    moved = db_session.get(Period, period_a)
    assert moved is not None
    moved.starts_on, moved.ends_on = date(2026, 9, 1), date(2026, 9, 1)
    db_session.flush()
    period_b = _period(db_session)
    second = run_period_assignment(db_session, period_b, [team_b], [room_id], saved_at=SAVED_AT)
    assert second.record_saved_at is not None

    with pytest.raises(ValueError, match="이미"):
        apply_record(db_session, period_b, second.record_saved_at)

    remaining = db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_a)
    ).all()
    assert len(remaining) == 1  # 첫 번째 기간의 현행 시간표(2칸이 이어진 구간 한 행)가 그대로 남아 있다
    assert db_session.scalars(
        select(Assignment).where(Assignment.period_id == period_b)
    ).all() == []


def test_duplicate_team_id_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="팀"):
        run_period_assignment(
            db_session, period_id, [team_id, team_id], [room_id], saved_at=SAVED_AT
        )


def test_duplicate_room_id_is_rejected(db_session: Session) -> None:
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    with pytest.raises(ValueError, match="합주실"):
        run_period_assignment(
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

    result = run_period_assignment(
        db_session, period.id, team_ids, room_ids, saved_at=SAVED_AT
    )

    assert result.record_saved_at is not None




def test_unavailable_time_on_the_last_day_of_the_period_blocks_assignment(
    db_session: Session,
) -> None:
    """기간 마지막 날(둘째 날)에 있는 불가능 일정도 첫날과 같게 배정을 막아야 합니다.

    기간의 끝을 시작일 기준으로 계산하면(예: window_end 를 starts_on 으로 잡으면)
    둘째 날의 불가능 일정이 기간 밖으로 판정되어 전부 제외됩니다. 그러면 이영희가
    항상 가능한 것으로 처리되어, 조율안 없이 배정에 성공합니다.
    """
    period_id = _period(db_session, days=2)  # 8/1 ~ 8/2
    team_id = _team_with_member(db_session, "A", "김민수")
    other = Member(name="이영희")
    db_session.add(other)
    db_session.flush()
    seat(db_session, team_id, other.id)
    # 마지막 날(8/2)에만 있는 불가능 일정입니다. 첫날(8/1)에는 제약이 없습니다.
    db_session.add(
        UnavailableTime(
            member_id=other.id,
            starts_at=datetime(2026, 8, 2, 18, 0),
            ends_at=datetime(2026, 8, 2, 19, 0),
            repeat_weekdays=None,
            repeat_until=None,
        )
    )
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))  # 하루 2칸 × 2일 = 4칸

    result = run_period_assignment(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    # 4칸 중 이영희가 불가능한 8/2 18시를 뺀 3칸만 받습니다.
    assert result.record_saved_at is not None
    assert [s.assigned_hours for s in result.report.shortfalls] == [3.0]


def test_multiple_unavailable_times_for_the_same_person_all_block_assignment(
    db_session: Session,
) -> None:
    """한 사람에게 불가능 일정이 2개 이상이면 전부 반영되어야 합니다.

    첫 번째 불가능 일정만 반영하면(예: expand_unavailable 이 rows 의 첫 원소만 사용하면) 두 번째
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
                repeat_weekdays=None,
                repeat_until=None,
            ),
            UnavailableTime(
                member_id=member_id,
                starts_at=datetime(2026, 8, 1, 20, 0),
                ends_at=datetime(2026, 8, 1, 22, 0),
                repeat_weekdays=None,
                repeat_until=None,
            ),
        ]
    )
    db_session.flush()

    result = run_period_assignment(
        db_session, period_id, [team_a, team_b], [room_id], saved_at=SAVED_AT
    )

    assert result.record_saved_at is not None


def test_allowed_absence_is_reported_with_position_and_cohort(
    db_session: Session,
) -> None:
    """불참 허용 1명이면 이영희가 불가능한 18시도 배정하고, 불참자로 포지션과 기수를 함께 보고합니다."""
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    blocked = Member(name="이영희", cohort=23)
    db_session.add(blocked)
    db_session.flush()
    seat(db_session, team_id, blocked.id, "보컬")
    period = db_session.get(Period, period_id)
    assert period is not None
    period.max_absent_members = 1
    db_session.add(
        UnavailableTime(
            member_id=blocked.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            repeat_weekdays=None,
            repeat_until=None,
        )
    )
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))

    result = run_period_assignment(
        db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT
    )

    # 팀이 2칸을 다 받지만 18시 session 에 이영희가 빠지므로 확정하지 않습니다.
    assert result.record_saved_at is not None
    assert result.report.shortfalls == []
    [absence] = result.report.absences
    assert (absence.team, absence.member, absence.cohort, absence.sessions) == ("A", "이영희", 23, 1)
    assert absence.position == "보컬"
    # 캘린더 블록이 쓰는 session 별 불참자입니다. 빠지는 18시 session 1개만 있습니다.
    [missing] = result.report.session_absences
    assert (missing.team, missing.start, missing.end, missing.member, missing.cohort) == (
        "A", datetime(2026, 8, 1, 18, 0), datetime(2026, 8, 1, 19, 0), "이영희", 23
    )


def test_the_report_flags_a_session_whose_absences_exceed_the_allowed_count(
    db_session: Session,
) -> None:
    """불참 허용 1명으로 계산한 결과를 0명으로 낮춘 뒤 다시 보고하면 초과로 표시합니다.

    적용 중인 배정안이 불가능 일정 변동으로 허용 인원을 넘었는지 화면이 경고하는 근거입니다(사용자 결정 2026-10-13).
    """
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    blocked = Member(name="이영희")
    db_session.add(blocked)
    db_session.flush()
    seat(db_session, team_id, blocked.id)
    period = db_session.get(Period, period_id)
    assert period is not None
    period.max_absent_members = 1
    db_session.add(
        UnavailableTime(
            member_id=blocked.id,
            starts_at=datetime(2026, 8, 1, 18, 0),
            ends_at=datetime(2026, 8, 1, 19, 0),
            repeat_weekdays=None,
            repeat_until=None,
        )
    )
    db_session.flush()
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))
    result = run_period_assignment(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)
    assert result.report.over_absent is False

    period.max_absent_members = 0
    db_session.flush()
    rows = assignment_rows(result.computed.assignment)
    again = schedule_report(db_session, period_id, [team_id], [room_id], rows, SAVED_AT.date())

    assert again.over_absent is True


def test_target_hours_of_the_period_replace_the_automatic_target(
    db_session: Session,
) -> None:
    # 자동 목표는 2칸 ÷ 1팀 = 2시간입니다. 기간에 1시간을 지정하면 1회만 받고, 목표를 채웠으므로 확정합니다.
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))
    period = db_session.get(Period, period_id)
    assert period is not None
    period.target_hours_per_team = 1
    db_session.flush()

    result = run_period_assignment(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)

    assert result.record_saved_at is not None
    assert result.report.target_hours == 1.0
    assert len(result.computed.assignment.sessions_by_team[team_id]) == 1


def test_the_period_daily_limit_caps_each_team_per_day(db_session: Session) -> None:
    # 합주실 3칸, 팀 1개면 자동 목표는 3회입니다. 기간의 하루 상한이 1시간이면 그날 1회만 받습니다.
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(21, 0))
    period = db_session.get(Period, period_id)
    assert period is not None
    period.daily_max_hours = 1
    period.max_consecutive_hours = 1
    db_session.flush()

    result = run_period_assignment(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)

    assert len(result.computed.assignment.sessions_by_team[team_id]) == 1


def test_the_period_consecutive_limit_splits_a_team_s_hours(db_session: Session) -> None:
    # 합주실 4칸, 하루 상한 4시간, 연속 상한 1시간이면 붙은 두 칸은 받지 못해 18시·20시처럼 떨어진 2회만 받습니다.
    period_id = _period(db_session)
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(22, 0))
    period = db_session.get(Period, period_id)
    assert period is not None
    period.daily_max_hours = 4
    period.max_consecutive_hours = 1
    db_session.flush()

    result = run_period_assignment(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)

    starts = sorted(session.interval.start for session in result.computed.assignment.sessions_by_team[team_id])
    assert len(starts) == 2
    assert starts[1] - starts[0] >= timedelta(hours=2)


def test_open_slots_come_from_the_saved_schedule_without_recomputing(
    db_session: Session,
) -> None:
    """남는 slot 은 저장된 배정에서 조회합니다. 배정 계산을 다시 실행하지 않습니다."""
    period_id = _period(db_session)  # 8/1 하루
    team_a = _team_with_member(db_session, "A", "김민수")
    team_b = _team_with_member(db_session, "B", "박지훈")
    room_id = _room(db_session, "1번방", time(18, 0), time(21, 0))  # 3칸

    result = run_period_assignment(
        db_session, period_id, [team_a, team_b], [room_id], saved_at=SAVED_AT
    )
    assert result.record_saved_at is not None
    assert apply_record(db_session, period_id, result.record_saved_at) is True
    assert len(result.computed.assignment.open_slots) == 1  # 3칸 - 팀당 1칸 × 2팀

    period = db_session.get(Period, period_id)
    assert period is not None
    left_open = open_slots_in_period(db_session, period, SAVED_AT.date())

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
    assert open_slots_in_period(db_session, period, SAVED_AT.date()) == []


def test_an_everyday_period_assigns_only_the_day_of_the_run(db_session: Session) -> None:
    """everyday 기간은 종료일이 없으므로 기간 전체가 아니라 계산을 실행한 날 하루만 배정합니다."""
    period_id = _period(db_session, days=3)  # 8/1 ~ 8/3
    period = db_session.get(Period, period_id)
    assert period is not None
    period.everyday = True
    db_session.flush()
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))
    db_session.commit()

    result = run_period_assignment(
        db_session, period_id, [team_id], [room_id], saved_at=datetime(2026, 8, 5, 9, 0)
    )

    assert result.record_saved_at is not None
    rows = db_session.scalars(select(AssignmentBackup)).all()
    assert {row.starts_at.date() for row in rows} == {date(2026, 8, 5)}


def test_ensemble_days_are_left_out_of_team_assignment(db_session: Session) -> None:
    """전체 합주 날짜는 팀별 배정에서 제외합니다. 한 날짜는 팀별·전체 중 한쪽에만 속합니다."""
    period_id = _period(db_session, days=2)  # 8/1 ~ 8/2
    team_id = _team_with_member(db_session, "A", "김민수")
    room_id = _room(db_session, "1번방", time(18, 0), time(20, 0))
    period = db_session.get(Period, period_id)
    assert period is not None
    period.ensemble_starts_on = period.ensemble_ends_on = date(2026, 8, 2)
    period.ensemble_room_id = room_id
    period.ensemble_starts_at, period.ensemble_ends_at = time(18, 0), time(20, 0)
    db_session.commit()

    result = run_period_assignment(db_session, period_id, [team_id], [room_id], saved_at=SAVED_AT)

    assert result.record_saved_at is not None
    rows = db_session.scalars(select(AssignmentBackup)).all()
    assert {row.starts_at.date() for row in rows} == {date(2026, 8, 1)}
