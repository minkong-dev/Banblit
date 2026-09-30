# 저장소 전체에 하나뿐인 설정을 읽고 수정합니다.

from sqlalchemy.orm import Session

from backend.db.models import Settings
from backend.contract import MAX_SESSION_MINUTES


def _row(session: Session) -> Settings:
    """설정 행을 가져옵니다. migration 이 넣어 두므로 없을 수 없습니다.

    그래도 없으면 DB 가 migration 을 거치지 않은 상태라는 뜻이라, 기본값으로 덮지 않고
    바로 실패시킵니다. 오류 없이 60 으로 동작하면 설정이 누락된 것을 알 수 없습니다.
    """
    row = session.get(Settings, 1)
    if row is None:
        raise RuntimeError("설정 행이 없습니다. migration 을 적용하십시오")
    return row


def slot_minutes(session: Session) -> int:
    """예약과 배정이 쓰는 시간 칸의 크기(분)입니다. 합주를 시작할 수 있는 간격이기도 합니다."""
    return _row(session).slot_minutes


def session_minutes(session: Session) -> int:
    """합주 1회가 이어지는 길이(분)입니다. 칸의 크기와는 다른 값입니다."""
    return _row(session).session_minutes


def daily_max_hours(session: Session) -> int:
    """팀 하나가 하루에 배정받는 시간의 상한(시간)입니다."""
    return _row(session).daily_max_hours


def set_settings(
    session: Session,
    slot: int | None = None,
    length: int | None = None,
    daily_hours: int | None = None,
) -> tuple[int, int]:
    """칸 크기와 합주 길이를 변경하고 저장된 두 값을 반환합니다. None 인 값은 그대로 둡니다.

    두 값을 한 함수에서 받는 이유는 서로를 제약하기 때문입니다. 30분 합주로 내리려면 칸도 30분으로
    내려야 하는데, 값마다 요청을 나누면 어느 쪽을 먼저 보내도 중간 상태가 조건을 어깁니다.

    이미 저장된 예약과 배정은 변경하지 않습니다. 단위를 늘리면 그 격자에 맞지 않는 기존 행이
    남는데, 삭제하면 사용자의 예약이 알림 없이 삭제되므로 그대로 둡니다.
    """
    row = _row(session)
    wanted_slot = row.slot_minutes if slot is None else slot
    wanted_length = row.session_minutes if length is None else length
    wanted_daily = row.daily_max_hours if daily_hours is None else daily_hours
    _check_fits(wanted_slot, wanted_length)
    # 하루 상한이 합주 1회보다 짧으면 하루에 들어가는 합주가 0회라, 오류 없이 모든 팀이 빈 배정을 받습니다.
    # 두 값은 따로 바꿀 수 있으므로 어느 쪽을 바꾸든 저장 전에 함께 봅니다.
    if wanted_length > wanted_daily * 60:
        raise ValueError(
            f"합주 1회({wanted_length}분)가 팀당 하루 최대({wanted_daily}시간)보다 길어요. "
            "하루 최대를 늘리거나 합주 길이를 줄여주세요"
        )
    # 세 값을 한 번에 기록합니다. 나눠 기록하면 뒤의 기록이 실패했을 때 앞의 변경만 남습니다.
    row.slot_minutes = wanted_slot
    row.session_minutes = wanted_length
    row.daily_max_hours = wanted_daily
    session.commit()
    return row.slot_minutes, row.session_minutes


def _check_fits(slot: int, length: int) -> None:
    """DB 의 CHECK 와 같은 조건을 사유가 있는 문구로 먼저 봅니다.

    CHECK 에 그대로 걸리게 두면 "제약 조건 위반"만 전달되어, 어느 값을 어떻게 고쳐야 하는지
    사용자가 알 수 없습니다.
    """
    if length < slot:
        raise ValueError(
            f"합주 길이({length}분)는 시간 칸({slot}분)보다 짧을 수 없어요. 칸을 먼저 줄여주세요"
        )
    if length % slot != 0:
        raise ValueError(
            f"합주 길이({length}분)는 시간 칸({slot}분)의 배수여야 해요. "
            f"{length - length % slot}분이나 {length - length % slot + slot}분으로 맞춰주세요"
        )
    if length > MAX_SESSION_MINUTES:
        raise ValueError(f"합주 길이는 {MAX_SESSION_MINUTES}분을 넘을 수 없어요")
