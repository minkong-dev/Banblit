from backend.services.period.period_service import record_points


def test_full_target_and_no_absence_is_100() -> None:
    assert record_points([3, 3], target_sessions=3, absences=0) == 100


def test_points_are_share_of_target_sessions() -> None:
    # 목표 2팀 × 4회 = 8회 중 6회를 받았습니다.
    assert record_points([4, 2], target_sessions=4, absences=0) == 75


def test_sessions_over_target_do_not_cover_other_teams() -> None:
    # 한 팀이 목표보다 많이 받아도 목표까지만 셉니다.
    assert record_points([6, 0], target_sessions=3, absences=0) == 50


def test_each_absence_takes_one_point() -> None:
    assert record_points([3, 3], target_sessions=3, absences=8) == 92


def test_points_do_not_go_below_zero() -> None:
    assert record_points([1], target_sessions=1, absences=500) == 0
