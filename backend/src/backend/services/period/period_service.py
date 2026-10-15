from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.period.period_input import (
    PracticeWindow,
    auto_sessions_per_team,
    build_engine_rooms,
    build_engine_teams,
    dates_in_period,
    expand_unavailable,
    target_sessions,
)
from backend.db.models import (
    Assignment,
    Member,
    TeamSlot,
    Period,
    Room,
    Team,
    UnavailableTime,
)
from backend.services.period.period_crud_service import ScheduleRow, get_period_or_raise
from backend.services.settings.pipeline import daily_max_hours, session_minutes, slot_minutes
from backend.db.pipeline import AssignmentRow
from backend.scheduling.pipeline import Assignment as EngineAssignment
from backend.scheduling.pipeline import Room as EngineRoom
from backend.scheduling.pipeline import Team as EngineTeam
from backend.scheduling.pipeline import (
    TimeInterval,
    absent_member_ids,
    assign,
    generate_slots,
)


@dataclass(frozen=True)
class PeriodAssignResult:
    """배정 결과와, 엔진이 사용한 번호를 화면에 표시할 이름으로 변환할 대응표입니다."""

    assignment: EngineAssignment
    target_sessions: int
    team_names: dict[int, str]
    room_names: dict[int, str]


@dataclass(frozen=True)
class Shortfall:
    """목표 시간보다 적게 배정받은 팀 하나입니다."""

    team_id: int
    team: str
    assigned_hours: float


@dataclass(frozen=True)
class Absence:
    """배정된 session 에 불가능 일정이 있어 빠지는 팀원 하나입니다. sessions 는 그 팀에서 빠지는 session 수입니다."""

    team_id: int
    team: str
    member_id: int
    member: str
    cohort: int | None
    position: str
    sessions: int


@dataclass(frozen=True)
class RecordScore:
    """시간표 하나의 점수입니다. 엔진 목적식(scheduling/assignment.py 의 _objective)과 같은 4항목이고 앞 항목이 우선합니다.

    기록마다 붙여 권한자가 적용할 기록을 고르는 근거로 씁니다. 점수로 자동 적용하지 않습니다(사용자 결정 2026-10-15).
    """

    # 가장 적게 받은 팀의 session 수입니다.
    fewest: int
    sessions: int
    # session 마다 빠지는 인원의 합입니다. 적을수록 좋습니다.
    absences: int
    # 같은 팀이 같은 합주실에서 바로 이어 쓰는 session 쌍의 수입니다.
    joined: int


@dataclass(frozen=True)
class ScheduleReport:
    """시간표 하나의 부족분과 불참자입니다. 저장하지 않고 볼 때마다 지금의 불가능 일정으로 계산합니다(사용자 결정 2026-10-12)."""

    target_hours: float
    shortfalls: list[Shortfall]
    absences: list[Absence]
    # session 1회라도 빠지는 인원이 기간의 불참 허용 인원(max_absent_members)을 넘으면 True 입니다.
    # 적용 중인 배정안이 불가능 일정 변동으로 허용 인원을 넘었는지 화면이 경고하는 근거입니다(사용자 결정 2026-10-13).
    over_absent: bool
    score: RecordScore


@dataclass(frozen=True)
class PeriodRun:
    """배정 계산 1회의 결과입니다. record_saved_at 은 쌓은 스케줄링 기록의 saved_at 이고, 배정이 0건이면 None 입니다."""

    computed: PeriodAssignResult
    report: ScheduleReport
    record_saved_at: datetime | None


@dataclass(frozen=True)
class OpenSlot:
    """어떤 팀도 배정받지 않은 slot(점유 단위 길이의 시간 칸) 하나입니다. 합주실 번호와 이름을 함께 포함합니다."""

    room_id: int
    room: str
    start: datetime
    end: datetime


@dataclass(frozen=True)
class _Roster:
    """팀별 명단입니다. 한 멤버는 한 팀에서 포지션 1개만 맡으므로(team_slots 의 (team_id, member_id) unique) positions 의 값도 1개입니다."""

    member_ids_by_team: dict[int, list[int]]
    names: dict[int, str]
    cohorts: dict[int, int | None]
    positions: dict[tuple[int, int], str]


@dataclass(frozen=True)
class _Inputs:
    """배정 계산과 결과 보고가 함께 쓰는 입력입니다. 두 곳이 같은 함수로 읽어 같은 규칙을 2벌 두지 않습니다."""

    rooms: list[Room]
    team_names: dict[int, str]
    roster: _Roster
    engine_teams: list[EngineTeam]
    engine_rooms: list[EngineRoom]
    slot_minutes: int
    session_minutes: int
    daily_max_minutes: int
    target_sessions: int
    max_absent: int


def assign_period(
    session: Session,
    period_id: int,
    team_ids: list[int],
    room_ids: list[int],
    saved_at: datetime,
) -> PeriodAssignResult:
    """기간 전체의 스케줄을 계산합니다. 저장은 하지 않습니다(services/period/pipeline.py 의 run_period_assignment).

    없는 기간·팀·합주실, 상시 기간(kind="open")은 ValueError 로 거부합니다.
    saved_at 은 everyday 기간의 배정 날짜입니다. 부르는 쪽이 넘겨야 같은 입력에 같은 결과가 나옵니다.
    """
    inputs = _prepare(session, period_id, team_ids, room_ids, saved_at.date())
    assignment = assign(
        inputs.engine_teams,
        inputs.engine_rooms,
        inputs.target_sessions,
        inputs.slot_minutes,
        inputs.session_minutes,
        inputs.daily_max_minutes,
        max_absent=inputs.max_absent,
    )
    return PeriodAssignResult(
        assignment=assignment,
        target_sessions=inputs.target_sessions,
        team_names=inputs.team_names,
        room_names={room.id: room.name for room in inputs.rooms},
    )


def schedule_report(
    session: Session,
    period_id: int,
    team_ids: list[int],
    room_ids: list[int],
    rows: list[AssignmentRow],
    on: date,
) -> ScheduleReport:
    """rows(현행 시간표 또는 스케줄링 기록 1개)의 부족분과 불참자를 지금의 불가능 일정으로 계산합니다.

    불참 판정은 엔진과 같은 absent_member_ids 를 씁니다. on 은 everyday 기간의 배정 날짜입니다(period_days).
    """
    inputs = _prepare(session, period_id, team_ids, room_ids, on)
    target_hours = inputs.target_sessions * inputs.session_minutes / 60
    hours: dict[int, float] = defaultdict(float)
    missed: dict[tuple[int, int], int] = defaultdict(int)
    teams = {team.id: team for team in inputs.engine_teams}
    over_absent = False
    counts: dict[int, int] = defaultdict(int)
    starts: set[tuple[int, int, datetime]] = set()
    ends: list[tuple[int, int, datetime]] = []
    for row in rows:
        hours[row["team_id"]] += (row["ends_at"] - row["starts_at"]).total_seconds() / 3600
        for piece in _sessions_of(row, inputs.session_minutes):
            counts[row["team_id"]] += 1
            starts.add((row["team_id"], row["room_id"], piece.start))
            ends.append((row["team_id"], row["room_id"], piece.end))
            absent = absent_member_ids(teams[row["team_id"]], piece)
            over_absent = over_absent or len(absent) > inputs.max_absent
            for member_id in absent:
                missed[(row["team_id"], member_id)] += 1
    return ScheduleReport(
        target_hours=target_hours,
        shortfalls=[
            Shortfall(team_id=team_id, team=inputs.team_names[team_id], assigned_hours=hours[team_id])
            for team_id in team_ids
            if hours[team_id] < target_hours
        ],
        absences=[_absence(inputs, team_id, member_id, count) for (team_id, member_id), count in sorted(missed.items())],
        over_absent=over_absent,
        score=RecordScore(
            # team_ids 에 든 팀 중 0회인 팀도 셉니다. 저장된 기록은 stored_report 가 모든 팀을 넘기므로, 일부 팀만 골라
            # 연산한 기록은 fewest 가 0 이 됩니다. 결과 설명의 부족분과 같은 기준입니다.
            # ponytail: 연산한 팀 목록을 기록에 저장하게 되면 그 목록으로 바꿉니다.
            fewest=min((counts[team_id] for team_id in team_ids), default=0),
            sessions=sum(counts.values()),
            absences=sum(missed.values()),
            joined=sum(1 for end in ends if end in starts),
        ),
    )


def stored_report(
    session: Session, period: Period, rows: list[ScheduleRow], on: date
) -> ScheduleReport | None:
    """저장된 시간표(현행 또는 스케줄링 기록 1개)의 보고입니다. 집중 합주기간이 아니거나 행이 없으면 None 입니다.

    저장된 시간표는 계산에 넣은 팀·합주실 목록을 보관하지 않으므로, 자동 배정(jobs/auto_assign.py)과 같이 모든 팀과
    모든 합주실을 기준으로 계산합니다.
    """
    # ponytail: everyday 기간은 on 하루치 목표로 보고합니다. 여러 날의 행이 쌓이면 부족분이 실제보다 적게 보입니다.
    # everyday 기간의 시간표를 날짜별로 보여 주게 되면 rows 를 on 날짜로 거릅니다.
    if period.kind != "focused" or not rows:
        return None
    team_ids = list(session.scalars(select(Team.id).order_by(Team.id)).all())
    room_ids = list(session.scalars(select(Room.id).order_by(Room.id)).all())
    stored_rows = [
        AssignmentRow(team_id=team_id, room_id=room_id, starts_at=start, ends_at=end)
        for team_id, _, room_id, _, start, end in rows
    ]
    return schedule_report(session, period.id, team_ids, room_ids, stored_rows, on)


def _absence(inputs: _Inputs, team_id: int, member_id: int, count: int) -> Absence:
    roster = inputs.roster
    return Absence(
        team_id=team_id,
        team=inputs.team_names[team_id],
        member_id=member_id,
        member=roster.names[member_id],
        cohort=roster.cohorts[member_id],
        position=roster.positions[(team_id, member_id)],
        sessions=count,
    )


def _sessions_of(row: AssignmentRow, length: int) -> list[TimeInterval]:
    # 저장된 행은 이어진 session 을 한 구간으로 합친 것이라(merge_runs) session 길이로 다시 나눕니다.
    # 저장 뒤 session 길이 설정이 바뀌어 나누어떨어지지 않아도 오류 없이 마지막 조각을 짧게 둡니다.
    pieces: list[TimeInterval] = []
    start = row["starts_at"]
    while start < row["ends_at"]:
        end = min(start + timedelta(minutes=length), row["ends_at"])
        pieces.append(TimeInterval(start, end))
        start = end
    return pieces


def _prepare(
    session: Session, period_id: int, team_ids: list[int], room_ids: list[int], on: date
) -> _Inputs:
    period = _check_request(session, period_id, team_ids, room_ids)
    rooms = _load_rooms(session, room_ids)
    team_names = _load_team_names(session, team_ids)
    roster = _load_roster(session, team_ids)

    days = period_days(period, on)
    if not days:
        raise ValueError("전체 합주 날짜뿐이라 팀별로 배정할 날짜가 없습니다")
    window_start = datetime.combine(days[0], time())
    window_end = datetime.combine(days[-1], time.max)
    unavailable_by_member = _load_unavailable(session, list(roster.names), window_start, window_end)

    engine_rooms = build_engine_rooms(rooms, days, practice_window(period))
    unit = slot_minutes(session)
    length = session_minutes(session)
    daily_max_minutes = daily_max_hours(session) * 60
    # 목표 시간을 지정한 기간은 자동값을 계산하지 않습니다. 자동값 계산은 자리가 없으면 거부하기 때문입니다.
    auto = 0 if period.target_hours_per_team is not None else auto_sessions_per_team(
        engine_rooms, len(team_ids), unit, length
    )
    return _Inputs(
        rooms=rooms,
        team_names=team_names,
        roster=roster,
        engine_teams=build_engine_teams(team_ids, roster.member_ids_by_team, unavailable_by_member),
        engine_rooms=engine_rooms,
        slot_minutes=unit,
        session_minutes=length,
        daily_max_minutes=daily_max_minutes,
        target_sessions=target_sessions(
            period.target_hours_per_team, auto, len(days), daily_max_minutes, length
        ),
        max_absent=period.max_absent_members,
    )


def _check_request(session: Session, period_id: int, team_ids: list[int], room_ids: list[int]) -> Period:
    """배정 요청을 검증하고 기간을 반환합니다. 없는 기간, 상시 기간(kind="open"), 중복된 팀·합주실 번호는 ValueError 입니다."""
    period = get_period_or_raise(session, period_id)
    if period.kind != "focused":
        raise ValueError("집중 합주기간에서만 자동 배정을 실행할 수 있습니다")
    if len(team_ids) != len(set(team_ids)):
        raise ValueError("팀 id가 중복되었습니다")
    if len(room_ids) != len(set(room_ids)):
        raise ValueError("합주실 id가 중복되었습니다")
    return period


def practice_window(period: Period) -> PracticeWindow:
    """기간에 저장된 팀별 합주 시간대입니다. 정하지 않은 쌍은 None 이고, 그날은 합주실 개방시각 전체를 씁니다.

    두 열은 함께 채워지거나 함께 비어 있습니다(periods_practice_window_pairs). 한쪽만 있는 경우가
    없으므로 시작 시간만 확인합니다.
    """

    def pair(starts: time | None, ends: time | None) -> tuple[time, time] | None:
        return None if starts is None or ends is None else (starts, ends)

    return PracticeWindow(
        weekday=pair(period.practice_weekday_starts_at, period.practice_weekday_ends_at),
        weekend=pair(period.practice_weekend_starts_at, period.practice_weekend_ends_at),
    )


def period_days(period: Period, on: date) -> list[date]:
    """배정을 계산할 날짜 목록을 반환합니다.

    everyday 가 켜진 기간은 종료일이 없으므로 계산을 실행한 날 on 하루만 반환합니다.
    그 외에는 시작일부터 종료일까지 전부 반환합니다. 전체 합주(모든 팀이 함께 하는 합주) 날짜는 팀별 배정 대상이
    아니므로 제외합니다. 전부 전체 합주 날짜면 빈 목록입니다.
    """
    days = [on] if period.everyday else dates_in_period(period.starts_on, period.ends_on)
    first, last = period.ensemble_starts_on, period.ensemble_ends_on
    if first is None or last is None:
        return days
    return [day for day in days if not first <= day <= last]


def _load_rooms(session: Session, room_ids: list[int]) -> list[Room]:
    rooms = session.scalars(select(Room).where(Room.id.in_(room_ids))).all()
    missing = set(room_ids) - {room.id for room in rooms}
    if missing:
        raise ValueError(
            f"존재하지 않는 합주실입니다: {', '.join(str(i) for i in sorted(missing))}"
        )
    return list(rooms)


def _load_team_names(session: Session, team_ids: list[int]) -> dict[int, str]:
    rows = session.execute(
        select(Team.id, Team.name).where(Team.id.in_(team_ids))
    ).all()
    names = {row[0]: row[1] for row in rows}
    missing = set(team_ids) - set(names)
    if missing:
        raise ValueError(
            f"존재하지 않는 팀입니다: {', '.join(str(i) for i in sorted(missing))}"
        )
    return names


def _load_roster(session: Session, team_ids: list[int]) -> _Roster:
    # 엔진에는 번호만 전달하고, 이름·기수·포지션은 결과 보고를 만들 때만 사용합니다.
    # member_id 가 None 인 TeamSlot 은 명단에 포함하지 않습니다. inner join 이 그 행을 제외합니다.
    rows = session.execute(
        select(TeamSlot.team_id, Member.id, Member.name, Member.cohort, TeamSlot.instrument)
        .join(Member, Member.id == TeamSlot.member_id)
        .where(TeamSlot.team_id.in_(team_ids))
        .order_by(TeamSlot.team_id, Member.id)
    ).all()
    member_ids_by_team: dict[int, list[int]] = defaultdict(list)
    names: dict[int, str] = {}
    cohorts: dict[int, int | None] = {}
    positions: dict[tuple[int, int], str] = {}
    for team_id, member_id, name, cohort, instrument in rows:
        member_ids_by_team[team_id].append(member_id)
        positions[(team_id, member_id)] = instrument
        names[member_id] = name
        cohorts[member_id] = cohort
    return _Roster(member_ids_by_team, names, cohorts, positions)


def open_slots_in_period(session: Session, period: Period, on: date) -> list[OpenSlot]:
    """그 기간에서 어떤 팀도 배정받지 않은 칸을 시작 시간순으로 반환합니다. on 은 everyday 기간의 대상 날짜입니다(period_days).

    저장된 배정에 사용된 합주실의 운영시간을 기간의 날짜마다 칸으로 분할한 뒤, 배정 구간과
    겹치는 칸을 제외합니다. 배정은 구간 한 행으로 저장되므로(db/models.py 의 Assignment) 시작
    시각이 같은지가 아니라 구간이 겹치는지로 판정합니다. 배정 계산(assign_period)은 이 함수에서
    실행하지 않습니다. 합주실 운영시간이 칸으로 분할되지 않으면 ValueError 를 발생시킵니다.
    """
    # ponytail: slot 을 만들 합주실을 저장된 Assignment 행에서 조회합니다. 배정에 입력한 합주실
    # 목록을 저장하는 table 이 없기 때문입니다. 그래서 slot 을 하나도 배정받지 못한 합주실은 이 결과에도
    # 포함되지 않습니다. period_rooms table 이 생기면 이 함수에서 그 목록을 읽습니다.
    taken = session.execute(
        select(Assignment.room_id, Assignment.starts_at, Assignment.ends_at).where(
            Assignment.period_id == period.id
        )
    ).all()
    if not taken:
        return []

    # ponytail: 칸마다 그 합주실의 배정 구간을 전부 훑습니다(칸 수 × 구간 수). 합주실 하나의
    # 기간 전체가 대상이라 지금 규모에서는 문제가 없습니다. 느려지면 구간을 시작 시간순으로
    # 정렬해 이분 탐색으로 변경합니다.
    occupied: dict[int, list[tuple[datetime, datetime]]] = defaultdict(list)
    for room_id, starts_at, ends_at in taken:
        occupied[room_id].append((starts_at, ends_at))
    rooms = session.scalars(
        select(Room).where(Room.id.in_(occupied.keys()))
    ).all()
    room_names = {room.id: room.name for room in rooms}

    days = period_days(period, on)
    open_slots: list[OpenSlot] = []
    # 팀별 합주 시간대(practice_window)를 넘기지 않습니다. 시간대 밖의 시간은 자동 배정만 하지
    # 않을 뿐 선착순 예약은 열려 있어야 하기 때문입니다. 합주실이 10시에 열고 팀별 합주가 17시부터면
    # 10~17시는 전부 예약할 수 있는 칸입니다.
    for engine_room in build_engine_rooms(list(rooms), days):
        ranges = occupied.get(engine_room.id, [])
        for interval in generate_slots(engine_room.open_period, slot_minutes(session)):
            # 반열린 구간이라 앞 배정이 끝나는 시각에 시작하는 칸은 비어 있습니다.
            if any(start < interval.end and interval.start < end for start, end in ranges):
                continue
            open_slots.append(
                OpenSlot(
                    room_id=engine_room.id,
                    room=room_names[engine_room.id],
                    start=interval.start,
                    end=interval.end,
                )
            )
    open_slots.sort(key=lambda slot: (slot.start, slot.room))
    return open_slots


def _load_unavailable(
    session: Session,
    member_ids: list[int],
    window_start: datetime,
    window_end: datetime,
) -> dict[int, list[TimeInterval]]:
    if not member_ids:
        return {}
    rows = session.scalars(
        select(UnavailableTime).where(UnavailableTime.member_id.in_(member_ids))
    ).all()
    by_member: dict[int, list[UnavailableTime]] = defaultdict(list)
    for row in rows:
        by_member[row.member_id].append(row)
    return {
        member_id: expand_unavailable(member_rows, window_start, window_end)
        for member_id, member_rows in by_member.items()
    }


def assignment_rows(assignment: EngineAssignment) -> list[AssignmentRow]:
    # 엔진이 반환한 session 을 저장할 행으로 변환합니다. session 1회가 행 1개이므로,
    # 60분 session 은 칸 크기가 30분이어도 30분짜리 행 2개가 아니라 60분짜리 행 1개입니다.
    # 팀 번호도 합주실 번호도 DB 의 번호 그대로이므로 변환할 값이 없습니다.
    rows: list[AssignmentRow] = []
    for team_id, sessions in assignment.sessions_by_team.items():
        for room_session in sessions:
            rows.append(
                {
                    "team_id": team_id,
                    "room_id": room_session.room_id,
                    "starts_at": room_session.interval.start,
                    "ends_at": room_session.interval.end,
                }
            )
    return rows
