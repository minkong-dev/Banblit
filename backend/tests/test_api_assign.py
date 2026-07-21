from fastapi.testclient import TestClient

from backend.api.app import app

client = TestClient(app)


def _feasible_body() -> dict:
    return {
        "teams": [{"name": "A", "members": [{"name": "hong", "unavailable": []}]}],
        "rooms": [
            {
                "name": "1번방",
                "open_period": {
                    "start": "2026-07-20T18:00:00",
                    "end": "2026-07-20T18:30:00",
                },
            }
        ],
        "slots_per_team": 1,
    }


def test_assign_returns_feasible_assignment() -> None:
    response = client.post("/assign", json=_feasible_body())

    assert response.status_code == 200
    data = response.json()
    assert data["assignment"]["feasible"] is True
    slot = data["assignment"]["slots_by_team"]["A"][0]
    assert slot["room"] == "1번방"
    assert slot["start"] == "2026-07-20T18:00:00"
    assert slot["end"] == "2026-07-20T18:30:00"
    assert data["proposals"] == []


def test_leftover_slots_are_returned_as_open_slots() -> None:
    # 방에 칸이 2개(18:00, 18:30), 팀이 1칸만 가져가면 남은 1칸이 예약 가능 자리로 나와야 한다.
    body = _feasible_body()
    body["rooms"][0]["open_period"]["end"] = "2026-07-20T19:00:00"

    response = client.post("/assign", json=body)

    assert response.status_code == 200
    data = response.json()
    assert data["assignment"]["feasible"] is True

    taken = data["assignment"]["slots_by_team"]["A"]
    open_slots = data["assignment"]["open_slots"]
    assert len(taken) == 1
    assert len(open_slots) == 1
    assert open_slots[0]["room"] == "1번방"

    # 가져간 칸과 남은 칸을 합치면 정확히 18:00, 18:30 두 칸이어야 한다.
    starts = sorted(slot["start"] for slot in taken + open_slots)
    assert starts == ["2026-07-20T18:00:00", "2026-07-20T18:30:00"]


def test_duplicate_room_name_is_rejected_as_422() -> None:
    body = _feasible_body()
    body["rooms"].append(dict(body["rooms"][0]))  # 같은 이름의 방을 하나 더

    response = client.post("/assign", json=body)

    assert response.status_code == 422
    assert "합주실 이름이 겹칩니다" in response.json()["detail"]


def test_timezone_aware_datetime_is_rejected_as_422() -> None:
    body = _feasible_body()
    body["rooms"][0]["open_period"]["start"] = "2026-07-20T18:00:00+09:00"
    body["rooms"][0]["open_period"]["end"] = "2026-07-20T18:30:00+09:00"

    response = client.post("/assign", json=body)

    assert response.status_code == 422
    assert "시간대" in response.json()["detail"]


def test_infeasible_request_returns_200_with_proposals() -> None:
    body = {
        "teams": [
            {
                "name": "A",
                "members": [
                    {
                        "name": "blocker",
                        "unavailable": [
                            {
                                "start": "2026-07-20T18:00:00",
                                "end": "2026-07-20T18:30:00",
                            }
                        ],
                    },
                    {"name": "free", "unavailable": []},
                ],
            }
        ],
        "rooms": [
            {
                "name": "1번방",
                "open_period": {
                    "start": "2026-07-20T18:00:00",
                    "end": "2026-07-20T18:30:00",
                },
            }
        ],
        "slots_per_team": 1,
    }

    response = client.post("/assign", json=body)

    assert response.status_code == 200
    data = response.json()
    assert data["assignment"]["feasible"] is False
    assert [p["excluded_member"] for p in data["proposals"]] == ["blocker"]


def test_too_many_teams_is_rejected_as_422() -> None:
    body = {
        "teams": [
            {
                "name": f"team{i}",
                "members": [{"name": f"member{i}", "unavailable": []}],
            }
            for i in range(21)
        ],
        "rooms": [
            {
                "name": "1번방",
                "open_period": {
                    "start": "2026-07-20T18:00:00",
                    "end": "2026-07-20T18:30:00",
                },
            }
        ],
        "slots_per_team": 1,
    }

    response = client.post("/assign", json=body)

    assert response.status_code == 422


def test_slots_request_exceeding_total_capacity_is_rejected_as_422() -> None:
    body = {
        "teams": [
            {"name": "A", "members": [{"name": "a1", "unavailable": []}]},
            {"name": "B", "members": [{"name": "b1", "unavailable": []}]},
        ],
        "rooms": [
            {
                "name": "1번방",
                "open_period": {
                    "start": "2026-07-20T18:00:00",
                    "end": "2026-07-20T19:00:00",
                },
            }
        ],
        "slots_per_team": 2,
    }

    response = client.post("/assign", json=body)

    assert response.status_code == 422
    assert "전체 칸 수" in response.json()["detail"]


def test_value_error_outside_assign_is_not_masked_as_422() -> None:
    # 배정 창구 밖에서 터진 ValueError 는 입력 오류(422)로 둔갑해서는 안 된다.
    import pytest
    from fastapi.testclient import TestClient

    from backend.api.app import app as prod_app

    @prod_app.get("/_boom_for_test")
    def boom() -> None:
        raise ValueError("internal fault")

    try:
        with pytest.raises(ValueError):
            TestClient(prod_app).get("/_boom_for_test")
    finally:
        prod_app.router.routes[:] = [
            r for r in prod_app.router.routes
            if getattr(r, "path", None) != "/_boom_for_test"
        ]


def test_shape_error_detail_is_a_single_string() -> None:
    # 형식 오류도 내용 오류와 같은 모양(detail = 문장 하나)이어야 한다.
    body = _feasible_body()
    body["slots_per_team"] = "많이"  # 숫자 자리에 글자

    response = client.post("/assign", json=body)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, str)
    assert "slots_per_team" in detail
