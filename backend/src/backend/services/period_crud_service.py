from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.services.input import (
    parse_calendar_date,
    parse_clock,
    require_ends_not_before_starts,
    require_valid_kind,
)
from backend.db.models import Period
from backend.db.pipeline import commit_translating

# 위반될 수 있는 제약과 그때 표시할 문장입니다. 제약 이름은 migration b5e1d9a37c42·d9a4c6e1f207 이 지정했습니다.
# 전체합주 설정(services/ensemble_service.py)도 이 문장을 씁니다.
PERIOD_MESSAGES = {
    "periods_focused_no_overlap": (
        "다른 집중 합주기간과 날짜가 겹칩니다. \"매일\" 기간은 종료일 없이 계속되는 것으로 봅니다"
    ),
    "periods_ensemble_within_period": "전체합주 날짜는 집중 합주기간 안이어야 합니다",
    "periods_ensemble_focused_only": "전체합주는 집중 합주기간에만 지정할 수 있습니다",
}


# 팀별합주 시간대 한 쌍입니다. 시각 두 개를 "HH:MM" 문자열로 받습니다. None 이면 그 쌍을 정하지
# 않았다는 뜻이고, 그날은 합주실 개방시각 전체를 씁니다.
ClockPair = tuple[str, str] | None


@dataclass(frozen=True)
class WindowIn:
    """팀별합주를 배정할 수 있는 하루 중의 시간대입니다. 평일(월~금)과 주말(토·일)이 서로 독립입니다.

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


def _pair_columns(part: str, pair: ClockPair) -> dict[str, object]:
    if pair is None:
        return {
            f"practice_{part}_starts_at": None,
            f"practice_{part}_ends_at": None,
        }
    label = "평일" if part == "weekday" else "주말"
    starts = parse_clock(pair[0], f"{label} 합주 시작 시각")
    ends = parse_clock(pair[1], f"{label} 합주 종료 시각")
    # DB 의 CHECK 도 같은 조건을 봅니다. 여기서 먼저 보는 것은 어느 쪽이 잘못됐는지 알리기 위해서입니다.
    if ends <= starts:
        raise ValueError(f"{label} 합주 종료 시각은 시작 시각보다 늦어야 합니다")
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
    starts_on: str,
    ends_on: str,
    everyday: bool,
    first_run_at: str,
    second_run_at: str,
    window: WindowIn | None = None,
) -> Period:
    """새 기간을 생성합니다. 경계에서 kind와 날짜 순서를 사람이 읽을 문장으로 검증합니다."""
    require_valid_kind(kind)
    starts = parse_calendar_date(starts_on, "시작일")
    ends = parse_calendar_date(ends_on, "종료일")
    require_ends_not_before_starts(starts, ends)

    period = Period(
        kind=kind,
        starts_on=starts,
        ends_on=ends,
        everyday=everyday,
        first_run_at=parse_clock(first_run_at, "1차 연산 시각"),
        second_run_at=parse_clock(second_run_at, "2차 연산 시각"),
        **(WindowIn() if window is None else window).columns(),
    )
    session.add(period)
    commit_translating(session, PERIOD_MESSAGES)
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
    starts_on: str | None,
    ends_on: str | None,
    everyday: bool | None,
    first_run_at: str | None,
    second_run_at: str | None,
    window: WindowIn | None = None,
) -> Period:
    """period_id의 기간에서 전달된 항목만 수정하여 저장하고, 수정된 기간을 반환합니다.

    window 가 None 이면 저장된 시간대를 그대로 둡니다. 지우려면 두 쌍이 None 인 WindowIn 을
    넘깁니다. "보내지 않음"과 "지움"을 구분해야, 다른 값만 고치는 요청이 시간대를 지우지 않습니다.
    """
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("그런 기간이 없습니다")

    # _validated_changes 를 먼저 통과시킨 뒤에만 대입합니다. 대입이 앞서면 검증이 실패해도
    # session 에 dirty 상태로 남아, 같은 session 에서 조회가 한 번이라도 실행되면 autoflush 로
    # 검증에 실패한 값이 데이터베이스에 기록됩니다.
    changes = _validated_changes(
        period, kind, starts_on, ends_on, first_run_at, second_run_at
    )
    if everyday is not None:
        changes["everyday"] = everyday
    if window is not None:
        changes.update(window.columns())
    for field, value in changes.items():
        setattr(period, field, value)

    commit_translating(session, PERIOD_MESSAGES)
    return period


def delete_period(session: Session, period_id: int) -> None:
    """period_id 의 기간을 삭제합니다. 없는 기간이면 ValueError 를 발생시킵니다.

    그 기간의 배정 결과(assignments)·계산 기록(assignment_runs)·이전 배정기록(assignment_backups)은
    외래 키 ondelete=CASCADE 로 DB 가 함께 삭제합니다. 예약은 기간과 연결되어 있지 않아 남습니다.
    """
    period = session.get(Period, period_id)
    if period is None:
        raise ValueError("그런 기간이 없습니다")
    session.delete(period)
    session.commit()
