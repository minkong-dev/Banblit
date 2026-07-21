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
