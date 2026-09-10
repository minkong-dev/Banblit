"""api/input.py 의 검사 하나하나. 빈 문자열·시각·날짜·구간 — 어느 표든 같은 규칙이다."""

from datetime import date, datetime
from datetime import date, time
from datetime import datetime, time
from datetime import time
import pytest

from backend.api.input import (
    format_calendar_date,
    format_clock,
    format_created_at,
    parse_calendar_date,
    parse_clock,
    require_closes_after_opens,
    require_email,
    require_ends_not_before_starts,
    require_non_empty,
    require_on_the_hour,
    require_password,
    require_one_repeat_cycle,
    require_repeat_until_only_when_repeating,
    require_same_day,
    require_valid_kind,
    require_valid_slot_bounds,
    require_within_room_hours,
)


def test_require_non_empty_trims_surrounding_whitespace() -> None:
    assert require_non_empty("  안녕하세요  ", "제목") == "안녕하세요"


def test_require_non_empty_rejects_an_empty_string() -> None:
    with pytest.raises(ValueError, match="제목"):
        require_non_empty("", "제목")


def test_require_non_empty_rejects_a_whitespace_only_string() -> None:
    with pytest.raises(ValueError, match="내용"):
        require_non_empty("   ", "내용")


def test_format_created_at_writes_seconds_without_microseconds() -> None:
    from datetime import datetime

    value = datetime(2026, 9, 4, 14, 30, 0, 123456)

    assert format_created_at(value) == "2026-09-04T14:30:00"

def test_require_name_trims_surrounding_whitespace() -> None:
    assert require_non_empty("  박서연  ", "이름") == "박서연"


def test_require_name_rejects_an_empty_string() -> None:
    with pytest.raises(ValueError, match="이름"):
        require_non_empty("   ", "이름")


def test_require_email_accepts_a_well_formed_address() -> None:
    assert require_email(" a@example.com ") == "a@example.com"


@pytest.mark.parametrize("value", ["", "no-at-sign", "a@b", "a@b.c"])
def test_require_email_rejects_malformed_addresses(value: str) -> None:
    with pytest.raises(ValueError, match="이메일"):
        require_email(value)


def test_require_password_accepts_all_four_kinds_of_character() -> None:
    require_password("Abcdef1!")


# 각 줄이 규칙 하나씩을 어긴다 — 짧음, 김, 소문자 없음, 대문자 없음, 숫자 없음, 특수기호 없음.
@pytest.mark.parametrize(
    "value",
    ["Abcde1!", "Abcdefghij1234567890!", "ABCDEF1!", "abcdef1!", "Abcdefg!", "Abcdefg1"],
)
def test_require_password_rejects_a_password_missing_any_rule(value: str) -> None:
    with pytest.raises(ValueError, match="비밀번호"):
        require_password(value)


def test_parse_clock_reads_a_room_time() -> None:
    assert parse_clock("19:00", "여는 시각") == time(19, 0)


def test_parse_clock_rejects_a_bad_room_time() -> None:
    with pytest.raises(ValueError, match="여는 시각"):
        parse_clock("18시정각", "여는 시각")


def test_format_clock_writes_a_room_time() -> None:
    assert format_clock(time(9, 0)) == "09:00"


def test_on_the_hour_accepts_on_grid_minutes() -> None:
    require_on_the_hour(time(18, 0), "여는 시각")
    require_on_the_hour(time(19, 0), "여는 시각")


def test_on_the_hour_rejects_off_grid_minute() -> None:
    with pytest.raises(ValueError, match="정시"):
        require_on_the_hour(time(18, 20), "여는 시각")


def test_closes_after_opens_rejects_equal_times() -> None:
    with pytest.raises(ValueError, match="늦어야"):
        require_closes_after_opens(time(20, 0), time(20, 0))


def test_closes_after_opens_rejects_earlier_close() -> None:
    with pytest.raises(ValueError, match="늦어야"):
        require_closes_after_opens(time(20, 0), time(19, 0))


def test_closes_after_opens_accepts_a_later_close() -> None:
    require_closes_after_opens(time(18, 0), time(23, 0))


def test_require_room_name_trims_surrounding_whitespace() -> None:
    assert require_non_empty("  1번방  ", "합주실 이름") == "1번방"


def test_require_room_name_rejects_an_empty_string() -> None:
    with pytest.raises(ValueError, match="합주실 이름"):
        require_non_empty("", "합주실 이름")


def test_require_room_name_rejects_a_whitespace_only_string() -> None:
    with pytest.raises(ValueError, match="합주실 이름"):
        require_non_empty("   ", "합주실 이름")


def test_parse_clock_reads_a_run_time() -> None:
    assert parse_clock("09:00", "1차 연산 시각") == time(9, 0)


def test_parse_clock_rejects_a_bad_run_time() -> None:
    with pytest.raises(ValueError, match="1차 연산 시각"):
        parse_clock("아침 9시", "1차 연산 시각")


def test_parse_clock_does_not_require_a_on_the_hour() -> None:
    # 자동 연산 시각은 격자 제약이 없다 — 09:17 같은 값도 받아들여야 한다.
    assert parse_clock("09:17", "1차 연산 시각") == time(9, 17)


def test_format_clock_writes_a_run_time() -> None:
    assert format_clock(time(21, 0)) == "21:00"


def test_parse_calendar_date_reads_iso_date() -> None:
    assert parse_calendar_date("2026-09-14", "시작일") == date(2026, 9, 14)


def test_parse_calendar_date_rejects_bad_format() -> None:
    with pytest.raises(ValueError, match="시작일"):
        parse_calendar_date("2026/09/14", "시작일")


def test_format_calendar_date_writes_iso() -> None:
    assert format_calendar_date(date(2026, 9, 27)) == "2026-09-27"


def test_valid_kind_accepts_open_and_focused() -> None:
    require_valid_kind("open")
    require_valid_kind("focused")


def test_valid_kind_rejects_anything_else() -> None:
    with pytest.raises(ValueError, match="kind"):
        require_valid_kind("party")


def test_ends_on_before_starts_on_is_rejected() -> None:
    with pytest.raises(ValueError, match="종료일"):
        require_ends_not_before_starts(date(2026, 9, 14), date(2026, 9, 13))


def test_ends_on_equal_to_starts_on_is_accepted() -> None:
    require_ends_not_before_starts(date(2026, 9, 14), date(2026, 9, 14))


def test_accepts_a_same_day_interval() -> None:
    require_same_day(datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 19, 0))


def test_rejects_an_interval_crossing_midnight() -> None:
    with pytest.raises(ValueError, match="하루"):
        require_same_day(datetime(2026, 9, 14, 23, 0), datetime(2026, 9, 15, 1, 0))


def test_accepts_an_interval_within_room_hours() -> None:
    require_within_room_hours(
        time(18, 0), time(22, 0), datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 20, 0)
    )


def test_rejects_starting_before_the_room_opens() -> None:
    with pytest.raises(ValueError, match="운영 시간"):
        require_within_room_hours(
            time(18, 0), time(22, 0), datetime(2026, 9, 14, 17), datetime(2026, 9, 14, 19, 0)
        )


def test_rejects_ending_after_the_room_closes() -> None:
    with pytest.raises(ValueError, match="운영 시간"):
        require_within_room_hours(
            time(18, 0), time(22, 0), datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 23)
        )


def test_accepts_a_valid_on_the_hour_aligned_interval() -> None:
    require_valid_slot_bounds(datetime(2026, 9, 14, 18, 0), datetime(2026, 9, 14, 20))


def test_rejects_off_grid_minutes() -> None:
    with pytest.raises(ValueError, match="정시"):
        require_valid_slot_bounds(datetime(2026, 9, 14, 18, 10), datetime(2026, 9, 14, 19, 0))


def test_rejects_an_end_not_after_the_start() -> None:
    with pytest.raises(ValueError):
        require_valid_slot_bounds(datetime(2026, 9, 14, 19, 0), datetime(2026, 9, 14, 18, 0))


def test_rejects_timezone_aware_moments() -> None:
    from datetime import timezone

    with pytest.raises(ValueError, match="시간대"):
        require_valid_slot_bounds(
            datetime(2026, 9, 14, 18, 0, tzinfo=timezone.utc),
            datetime(2026, 9, 14, 19, 0, tzinfo=timezone.utc),
        )


def test_allows_repeat_until_when_repeating_weekly() -> None:
    require_repeat_until_only_when_repeating(False, True, date(2026, 12, 31))


def test_allows_repeat_until_when_repeating_daily() -> None:
    require_repeat_until_only_when_repeating(True, False, date(2026, 12, 31))


def test_allows_no_repeat_until_when_not_repeating() -> None:
    require_repeat_until_only_when_repeating(False, False, None)


def test_rejects_repeat_until_when_not_repeating() -> None:
    with pytest.raises(ValueError, match="반복"):
        require_repeat_until_only_when_repeating(False, False, date(2026, 12, 31))


def test_allows_one_repeat_cycle() -> None:
    require_one_repeat_cycle(True, False)
    require_one_repeat_cycle(False, True)
    require_one_repeat_cycle(False, False)


def test_rejects_daily_and_weekly_together() -> None:
    with pytest.raises(ValueError, match="함께 켤 수 없습니다"):
        require_one_repeat_cycle(True, True)


def test_require_team_name_rejects_an_empty_string() -> None:
    with pytest.raises(ValueError, match="팀 이름"):
        require_non_empty("", "팀 이름")


def test_require_team_name_rejects_a_whitespace_only_string() -> None:
    with pytest.raises(ValueError, match="팀 이름"):
        require_non_empty("   ", "팀 이름")
