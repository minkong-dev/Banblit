from datetime import datetime

from backend.scheduling.availability import Member, is_member_available
from backend.scheduling.interval import TimeInterval


def test_member_unavailable_when_slot_overlaps_their_unavailable_time():
    lesson = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 20, 0))
    member = Member(name="hong", unavailable=[lesson])
    slot = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 19, 30))

    assert is_member_available(member, slot) is False


def test_member_available_when_slot_is_outside_their_unavailable_time():
    lesson = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 20, 0))
    member = Member(name="hong", unavailable=[lesson])
    slot = TimeInterval(datetime(2026, 7, 20, 21, 0), datetime(2026, 7, 20, 21, 30))

    assert is_member_available(member, slot) is True


def test_member_available_when_slot_is_adjacent_to_unavailable_time():
    # 불가능 18~19시, 슬롯 19~20시 — 딱 붙지만 겹치지는 않으므로 가능
    lesson = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    member = Member(name="hong", unavailable=[lesson])
    slot = TimeInterval(datetime(2026, 7, 20, 19, 0), datetime(2026, 7, 20, 20, 0))

    assert is_member_available(member, slot) is True
