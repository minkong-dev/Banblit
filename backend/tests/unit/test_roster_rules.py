"""roster 의 포지션 수 검증을 DB 없이 검증합니다."""

import pytest

from backend.services.roster.roster_service import require_slot_counts


def test_zero_slots_are_dropped_and_the_rest_kept() -> None:
    assert require_slot_counts({"보컬": 1, "드럼": 0, "일렉": 2}, max_slots=10) == {"보컬": 1, "일렉": 2}


@pytest.mark.parametrize(
    ("counts", "message"),
    [({"피아노": 1}, "알 수 없는 포지션"), ({"보컬": -1}, "0보다 작을"), ({"보컬": 0}, "하나 이상"), ({"보컬": 11}, "10개까지")],
)
def test_bad_counts_are_refused(counts: dict[str, int], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        require_slot_counts(counts, max_slots=10)
