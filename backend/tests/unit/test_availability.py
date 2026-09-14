from datetime import datetime

from backend.scheduling.availability import Member, is_member_available
from backend.scheduling.interval import TimeInterval


def test_member_unavailable_when_slot_overlaps_their_unavailable_time() -> None:
    lesson = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 20, 0))
    member = Member(id=1, unavailable=[lesson])
    slot = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 20))

    assert is_member_available(member, slot) is False


def test_member_available_when_slot_is_outside_their_unavailable_time() -> None:
    lesson = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 20, 0))
    member = Member(id=1, unavailable=[lesson])
    slot = TimeInterval(datetime(2026, 7, 20, 21, 0), datetime(2026, 7, 20, 22))

    assert is_member_available(member, slot) is True


def test_member_available_when_slot_is_adjacent_to_unavailable_time() -> None:
    # 불가능 시간은 18~19시, slot(1시간 단위 시간 칸)은 19~20시로 인접하지만 겹치지 않으므로 배정 가능합니다.
    lesson = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    member = Member(id=1, unavailable=[lesson])
    slot = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 20, 0))

    assert is_member_available(member, slot) is True
