# 저장소 전체에 하나뿐인 설정을 읽고 수정합니다.

from sqlalchemy.orm import Session

from backend.db.models import Settings
from backend.contract import MAX_SESSION_MINUTES


def _row(session: Session) -> Settings:
    """설정 행을 조회합니다. 행이 존재하지 않으면 RuntimeError 를 발생시킵니다."""
    row = session.get(Settings, 1)
    if row is None:
        raise RuntimeError("설정 행이 존재하지 않습니다. migration 을 적용하십시오")
    return row


def slot_minutes(session: Session) -> int:
    """예약과 배정이 쓰는 시간 칸의 크기(분)입니다. 합주를 시작할 수 있는 간격이기도 합니다."""
    return _row(session).slot_minutes


def session_minutes(session: Session) -> int:
    """합주 1회가 이어지는 길이(분)입니다. 칸의 크기와는 다른 값입니다."""
    return _row(session).session_minutes


def set_settings(
    session: Session,
    new_slot_minutes: int | None = None,
    new_session_minutes: int | None = None,
) -> None:
    """칸 크기(slot_minutes)와 합주 1회 길이(session_minutes)를 변경합니다. None 인 값은 그대로 둡니다.

    합주 길이는 칸 크기의 배수여야 하므로 두 값을 한 번에 검증합니다. 이미 저장된 예약과 배정은 변경하지 않습니다.
    """
    row = _row(session)
    wanted_slot = row.slot_minutes if new_slot_minutes is None else new_slot_minutes
    wanted_length = row.session_minutes if new_session_minutes is None else new_session_minutes
    _check_fits(wanted_slot, wanted_length)
    # 두 값을 한 번에 기록합니다. 나눠 기록하면 뒤의 기록이 실패했을 때 앞의 변경만 남습니다.
    row.slot_minutes = wanted_slot
    row.session_minutes = wanted_length
    session.commit()


def _check_fits(slot: int, length: int) -> None:
    """DB 의 CHECK 와 같은 조건을 먼저 검사하고, 위반하면 사유를 담은 ValueError 를 발생시킵니다."""
    if length < slot:
        raise ValueError(
            f"합주 길이({length}분)는 점유 단위({slot}분)보다 짧을 수 없어요. 점유 단위를 먼저 줄여주세요"
        )
    if length % slot != 0:
        raise ValueError(
            f"합주 길이({length}분)는 점유 단위({slot}분)의 배수여야 해요. "
            f"{length - length % slot}분이나 {length - length % slot + slot}분으로 맞춰주세요"
        )
    if length > MAX_SESSION_MINUTES:
        raise ValueError(f"합주 길이는 {MAX_SESSION_MINUTES}분을 넘을 수 없어요")
