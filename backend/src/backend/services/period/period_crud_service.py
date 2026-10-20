from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.services.validation.pipeline import (
    parse_calendar_date,
    parse_clock,
    require_clock_range,
    require_ends_not_before_starts,
    require_valid_kind,
)
from backend.contract import DEFAULT_DAILY_MAX_HOURS, DEFAULT_MAX_CONSECUTIVE_HOURS, MAX_DAILY_HOURS
from backend.db.models import Assignment, AssignmentBackup, Period, Room, Team, TeamSlot
from backend.services.settings.pipeline import session_minutes
from backend.services.reservation.pipeline import cancel_reservations_in_focus
from backend.db.pipeline import commit_translating
from backend.services.period.close_service import require_naive_close

# 위반될 수 있는 제약과 그때 표시할 문장입니다. 제약 이름은 migration b5e1d9a37c42·d9a4c6e1f207 이 지정했습니다.
# 전체 합주 설정(services/period/ensemble_service.py)도 이 문장을 씁니다.
PERIOD_MESSAGES = {
    "periods_focused_no_overlap": (
        "다른 집중 합주기간과 날짜가 겹쳐요. \"매일\" 기간은 종료일 없이 계속되는 것으로 봐요"
    ),
    "periods_ensemble_within_period": "전체 합주 날짜는 집중 합주기간 안이어야 해요",
    "periods_ensemble_focused_only": "전체 합주는 집중 합주기간에만 지정할 수 있어요",
}


def commit_with_cancellations(session: Session, period: Period, now: datetime) -> None:
    """기간 변경과, 그 변경으로 거절 대상이 된 now 이후 예약의 취소·알림을 commit 1회로 저장합니다.

    취소(cancel_reservations_in_focus)는 시작할 때 flush 하므로 기간 제약 위반이 그 flush 에서 발생합니다.
    commit_translating 의 action 안에서 실행해, 그 위반도 rollback 되고 PERIOD_MESSAGES 의 문장으로 변환됩니다.
    기간을 먼저 commit 하고 취소를 두 번째 commit 으로 저장하면, 두 번째 commit 이 실패했을 때 기간만 바뀌고
    취소·알림은 저장되지 않습니다.
    """

    def action() -> None:
        cancel_reservations_in_focus(session, period, now)
        session.commit()

    commit_translating(session, PERIOD_MESSAGES, action)


# 팀별 합주 시간대 한 쌍입니다. 시각 두 개를 "HH:MM" 문자열로 받습니다. None 이면 그 쌍을 정하지
# 않았다는 뜻이고, 그날은 합주실 개방시각 전체를 씁니다.
ClockPair = tuple[str, str] | None


@dataclass(frozen=True)
class WindowIn:
    """팀별 합주를 배정할 수 있는 하루 중의 시간대입니다. 평일(월~금)과 주말(토·일)이 서로 독립입니다.

    시각 네 개를 매개변수로 따로 받지 않고 값 하나로 묶습니다. 기간을 만들고 고치는 함수는 이미
    매개변수가 일곱 개라, 네 개를 더하면 호출부에서 어느 자리가 무엇인지 읽히지 않습니다.
    """

    weekday: ClockPair = None
    weekend: ClockPair = None

    def columns(self) -> dict[str, object]:
        """저장할 열 네 개를 반환합니다. 정하지 않은 쌍은 두 열 모두 None 입니다."""
        return {
            **_pair_columns("weekday", self.weekday),
            **_pair_columns("weekend", self.weekend),
        }


@dataclass(frozen=True)
class AssignRuleIn:
    """배정 규칙입니다. target_hours 가 None 이면 팀당 목표 시간은 전체 시간 ÷ 팀 수입니다(사용자 결정 2026-10-12).

    daily_max_hours 는 팀 1개가 하루에 받는 시간의 상한, max_consecutive_hours 는 끊기지 않고 이어지는 시간의 상한입니다(사용자 결정 2026-10-20).
    """

    target_hours: int | None = None
    max_absent: int = 0
    daily_max_hours: int = DEFAULT_DAILY_MAX_HOURS
    max_consecutive_hours: int = DEFAULT_MAX_CONSECUTIVE_HOURS

    def columns(self, session_length: int) -> dict[str, object]:
        """저장할 열 네 개를 반환합니다. DB 의 CHECK 도 같은 조건을 보지만, 어느 값이 잘못됐는지 알리기 위해 먼저 봅니다.

        session_length 는 설정의 합주 1회 길이(분)입니다. 하루 상한이 이보다 짧으면 하루에 들어가는 합주가 0회라 거절합니다.
        """
        if self.target_hours is not None and self.target_hours <= 0:
            raise ValueError("팀당 목표 시간은 1시간 이상이어야 해요")
        if self.max_absent < 0:
            raise ValueError("불참 허용 인원은 0명 이상이어야 해요")
        if not 1 <= self.daily_max_hours <= MAX_DAILY_HOURS:
            raise ValueError(f"팀당 하루 최대는 1~{MAX_DAILY_HOURS}시간이어야 해요")
        if not 1 <= self.max_consecutive_hours <= self.daily_max_hours:
            raise ValueError("최대 연속은 1시간 이상, 팀당 하루 최대 이하여야 해요")
        require_session_fits(session_length, self.daily_max_hours, self.max_consecutive_hours)
        return {
            "target_hours_per_team": self.target_hours,
            "max_absent_members": self.max_absent,
            "daily_max_hours": self.daily_max_hours,
            "max_consecutive_hours": self.max_consecutive_hours,
        }


def require_session_fits(session_length: int, daily_max_hours: int, max_consecutive_hours: int) -> None:
    """합주 1회(session_length 분)가 팀당 하루 최대나 최대 연속보다 길면 ValueError 를 발생시킵니다.

    길면 하루에 들어가는 합주가 0회라, error 없이 모든 팀이 빈 배정을 받습니다.
    """
    for label, hours in (("팀당 하루 최대", daily_max_hours), ("최대 연속", max_consecutive_hours)):
        if session_length > hours * 60:
            raise ValueError(
                f"합주 1회({session_length}분)가 {label}({hours}시간)보다 길어요. {label}를 늘리거나 합주 길이를 줄여주세요"
            )


def _pair_columns(part: str, pair: ClockPair) -> dict[str, object]:
    if pair is None:
        return {
            f"practice_{part}_starts_at": None,
            f"practice_{part}_ends_at": None,
        }
    label = "평일" if part == "weekday" else "주말"
    starts = parse_clock(pair[0], f"{label} 합주 시작 시간")
    ends = parse_clock(pair[1], f"{label} 합주 종료 시간")
    # DB 의 CHECK 도 같은 조건을 봅니다. 여기서 먼저 보는 것은 어느 쪽이 잘못됐는지 알리기 위해서입니다.
    require_clock_range(starts, ends, f"{label} 합주 시간")
    return {
        f"practice_{part}_starts_at": starts,
        f"practice_{part}_ends_at": ends,
    }


def list_periods(session: Session) -> list[Period]:
    return list(
        session.scalars(select(Period).order_by(Period.starts_on, Period.id)).all()
    )


def create_period(
    session: Session,
    kind: str,
    name: str,
    starts_on: str,
    ends_on: str,
    everyday: bool,
    first_run_at: str,
    second_run_at: str,
    window: WindowIn | None = None,
    rule: AssignRuleIn | None = None,
    *,
    now: datetime,
    closes_at: datetime | None = None,
) -> Period:
    """새 기간을 생성합니다. 경계에서 kind와 날짜 순서, closes_at(마감 일시)의 시간대 유무를 사람이 읽을 문장으로 검증합니다."""
    require_valid_kind(kind)
    require_naive_close(closes_at)
    starts = parse_calendar_date(starts_on, "시작일")
    ends = parse_calendar_date(ends_on, "종료일")
    require_ends_not_before_starts(starts, ends)

    period = Period(
        kind=kind,
        name=name.strip(),
        starts_on=starts,
        ends_on=ends,
        everyday=everyday,
        first_run_at=parse_clock(first_run_at, "1차 연산 시각"),
        second_run_at=parse_clock(second_run_at, "2차 연산 시각"),
        **(WindowIn() if window is None else window).columns(),
        **(AssignRuleIn() if rule is None else rule).columns(session_minutes(session)),
        closes_at=closes_at,
    )
    session.add(period)
    commit_with_cancellations(session, period, now)
    return period


def _validated_changes(
    period: Period,
    kind: str | None,
    starts_on: str | None,
    ends_on: str | None,
    first_run_at: str | None,
    second_run_at: str | None,
) -> dict[str, object]:
    """전달된 항목을 검증하여 수정할 값만 담아 반환합니다. 전달되지 않은 항목은 포함하지 않습니다."""
    changes: dict[str, object] = {}
    if kind is not None:
        require_valid_kind(kind)
        changes["kind"] = kind

    starts = (
        parse_calendar_date(starts_on, "시작일") if starts_on is not None else period.starts_on
    )
    ends = parse_calendar_date(ends_on, "종료일") if ends_on is not None else period.ends_on
    require_ends_not_before_starts(starts, ends)
    changes["starts_on"] = starts
    changes["ends_on"] = ends

    if first_run_at is not None:
        changes["first_run_at"] = parse_clock(first_run_at, "1차 연산 시각")
    if second_run_at is not None:
        changes["second_run_at"] = parse_clock(second_run_at, "2차 연산 시각")
    return changes


def update_period(
    session: Session,
    period_id: int,
    kind: str | None,
    name: str | None,
    starts_on: str | None,
    ends_on: str | None,
    everyday: bool | None,
    first_run_at: str | None,
    second_run_at: str | None,
    window: WindowIn | None = None,
    rule: AssignRuleIn | None = None,
    *,
    now: datetime,
    closes_at: datetime | None | Literal["keep"] = "keep",
) -> Period:
    """period_id의 기간에서 전달된 항목만 수정하여 저장하고, 수정된 기간을 반환합니다.

    closes_at 이 "keep" 이면 저장된 마감 일시를 그대로 두고, None 이면 마감 일시를 비웁니다.
    확정된 기간의 마감 일시를 다른 값으로 변경하면 ValueError 입니다.

    window 가 None 이면 저장된 시간대를 그대로 둡니다. 지우려면 두 쌍이 None 인 WindowIn 을
    넘깁니다. "보내지 않음"과 "지움"을 구분해야, 다른 값만 고치는 요청이 시간대를 지우지 않습니다.
    """
    period = get_period_or_raise(session, period_id)

    # _validated_changes 를 먼저 통과시킨 뒤에만 대입합니다. 대입이 앞서면 검증이 실패해도
    # session 에 dirty 상태로 남아, 같은 session 에서 조회가 한 번이라도 실행되면 autoflush 로
    # 검증에 실패한 값이 데이터베이스에 기록됩니다.
    changes = _validated_changes(
        period, kind, starts_on, ends_on, first_run_at, second_run_at
    )
    if name is not None:
        changes["name"] = name.strip()
    if everyday is not None:
        changes["everyday"] = everyday
    if window is not None:
        changes.update(window.columns())
    if rule is not None:
        changes.update(rule.columns(session_minutes(session)))
    if closes_at != "keep" and closes_at != period.closes_at:
        require_naive_close(closes_at)
        if period.fixed_at is not None:
            raise ValueError("확정된 기간은 마감 일시를 변경할 수 없어요. 확정을 해제한 뒤 변경해주세요")
        changes["closes_at"] = closes_at
    for field, value in changes.items():
        setattr(period, field, value)
    commit_with_cancellations(session, period, now)
    return period


def delete_period(session: Session, period_id: int) -> None:
    """period_id 의 기간을 삭제합니다. 없는 기간이면 ValueError 를 발생시킵니다.

    그 기간의 배정 결과(assignments)·계산 기록(assignment_runs)·이전 배정기록(assignment_backups)은
    외래 키 ondelete=CASCADE 로 DB 가 함께 삭제합니다. 예약은 기간과 연결되어 있지 않아 남습니다.
    """
    period = get_period_or_raise(session, period_id)
    session.delete(period)
    session.commit()


# ── 조회 ─────────────────────────────────────────────────────────────────────

ScheduleRow = tuple[int, str, int, str, datetime, datetime]
"""(팀 id, 팀 이름, 합주실 id, 합주실명, 시작 시간, 종료 시간)"""


def focused_periods_on(session: Session, day: date) -> list[Period]:
    """day 가 기간 안에 포함되는 집중 합주기간을 번호 순서로 반환합니다. "매일" 기간은 종료일이 없어 시작일만 비교합니다."""
    return list(
        session.scalars(
            select(Period)
            .where(Period.kind == "focused")
            .where(Period.starts_on <= day)
            .where(or_(Period.everyday.is_(True), Period.ends_on >= day))
            .order_by(Period.id)
        ).all()
    )


def every_team_and_room(session: Session) -> tuple[list[int], list[int]]:
    """멤버가 1명 이상 배정된 팀 번호와 모든 합주실 번호를 번호 순서로 반환합니다. 자동 배정과 저장된 시간표의 결과 설명이 대상으로 씁니다.
    멤버가 없는 팀은 제외합니다. 배정 계산은 멤버가 없는 팀이 1개라도 있으면 전체를 거절합니다."""
    seated = select(TeamSlot.team_id).where(TeamSlot.member_id.is_not(None))
    team_ids = list(session.scalars(select(Team.id).where(Team.id.in_(seated)).order_by(Team.id)).all())
    room_ids = list(session.scalars(select(Room.id).order_by(Room.id)).all())
    return team_ids, room_ids


def get_period_or_raise(session: Session, period_id: int) -> Period:
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("존재하지 않는 기간이에요")
    return period


def list_schedule(session: Session, period_id: int) -> list[ScheduleRow]:
    """그 기간의 확정 배정을 시작 시간과 합주실명 순으로 반환합니다."""
    rows = session.execute(
        select(Assignment, Team.name, Room.name)
        .join(Team, Team.id == Assignment.team_id)
        .join(Room, Room.id == Assignment.room_id)
        .where(Assignment.period_id == period_id)
        .order_by(Assignment.starts_at, Room.name)
    ).all()
    return [
        (a.team_id, team_name, a.room_id, room_name, a.starts_at, a.ends_at)
        for a, team_name, room_name in rows
    ]


def list_backup_round(session: Session, period_id: int, saved_at: datetime) -> list[ScheduleRow]:
    """스케줄링 기록(backup round) 1개의 스케줄을 반환합니다. 배정기록을 식별하는 값은 저장 시각입니다.

    배정이 1개도 없는 배정기록은 저장되지 않으므로, 빈 결과일 경우 ValueError 를 발생시킵니다.
    """
    rows = session.execute(
        select(AssignmentBackup, Team.name, Room.name)
        .join(Team, Team.id == AssignmentBackup.team_id)
        .join(Room, Room.id == AssignmentBackup.room_id)
        .where(AssignmentBackup.period_id == period_id)
        .where(AssignmentBackup.saved_at == saved_at)
        .order_by(AssignmentBackup.starts_at, Room.name)
    ).all()
    if not rows:
        raise ValueError("존재하지 않는 배정기록이에요")
    return [
        (b.team_id, team_name, b.room_id, room_name, b.starts_at, b.ends_at)
        for b, team_name, room_name in rows
    ]
