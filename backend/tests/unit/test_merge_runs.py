"""배정 구간 합치기입니다. DB 를 사용하지 않습니다.

save_schedule 이 저장 직전에 호출하는 순수 함수라, 경계 조건은 이 파일이 확인하고
DB 에 실제로 한 행으로 들어가는지는 tests/integration/db/test_schedule_store.py 가 확인합니다.
"""

from datetime import datetime

from backend.db.schedule_store import AssignmentRow, merge_runs


def _row(team_id: int, room_id: int, hour: int) -> AssignmentRow:
    return {
        "team_id": team_id,
        "room_id": room_id,
        "starts_at": datetime(2026, 8, 1, hour, 0),
        "ends_at": datetime(2026, 8, 1, hour + 1),
    }


def test_no_rows_produce_no_rows() -> None:
    assert merge_runs([]) == []


def test_the_same_team_in_another_room_is_not_joined() -> None:
    """합주실이 다르면 시각이 이어져도 각각의 행입니다. 한 행은 합주실 하나의 점유입니다."""
    merged = merge_runs([_row(1, 1, 19), _row(1, 2, 20)])

    assert [(row["room_id"], row["starts_at"].hour, row["ends_at"].hour) for row in merged] == [
        (1, 19, 20),
        (2, 20, 21),
    ]


def test_rows_out_of_order_are_joined() -> None:
    """입력 순서가 뒤집혀도 합칩니다. 배정 계산이 시각순으로 내놓는다는 보장이 없습니다."""
    merged = merge_runs([_row(1, 1, 21), _row(1, 1, 19), _row(1, 1, 20)])

    assert len(merged) == 1
    assert merged[0]["starts_at"] == datetime(2026, 8, 1, 19, 0)
    assert merged[0]["ends_at"] == datetime(2026, 8, 1, 22, 0)


def test_the_input_is_not_modified() -> None:
    """호출자가 넘긴 목록과 그 안의 행을 수정하지 않습니다."""
    rows = [_row(1, 1, 19), _row(1, 1, 20)]

    merge_runs(rows)

    assert len(rows) == 2
    assert rows[0]["ends_at"] == datetime(2026, 8, 1, 20, 0)
