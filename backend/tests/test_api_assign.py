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
