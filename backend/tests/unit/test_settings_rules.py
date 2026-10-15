"""settings 의 합주 길이와 칸 크기 조합 검증을 DB 없이 검증합니다."""

import pytest

from backend.services.settings.settings_service import _check_fits


def test_a_length_that_is_a_multiple_of_the_slot_fits() -> None:
    _check_fits(30, 60)


def test_a_length_shorter_than_the_slot_is_refused() -> None:
    with pytest.raises(ValueError, match="짧을 수 없어요"):
        _check_fits(60, 30)
