# 저장소 전체에 하나뿐인 설정을 읽고 수정합니다.

from sqlalchemy.orm import Session

from backend.db.models import Settings


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
    """예약과 배정이 쓰는 시간 칸의 크기(분)입니다."""
    return _row(session).slot_minutes


def set_slot_minutes(session: Session, minutes: int) -> int:
    """시간 칸의 크기를 변경합니다. 허용하지 않는 값은 DB 의 CHECK 가 거절합니다.

    이미 저장된 예약과 배정은 변경하지 않습니다. 단위를 늘리면 그 격자에 맞지 않는 기존 행이
    남는데, 삭제하면 사용자의 예약이 알림 없이 삭제되므로 그대로 둡니다.
    """
    row = _row(session)
    row.slot_minutes = minutes
    session.commit()
    return row.slot_minutes
