from datetime import datetime

from backend.api.mapping import request_to_engine
from backend.api.schemas import AssignRequest
from backend.scheduling.assignment import Room
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval


def test_request_maps_to_engine_objects() -> None:
    req = AssignRequest.model_validate(
        {
            "teams": [
                {
                    "name": "A",
                    "members": [
                        {
                            "name": "hong",
                            "unavailable": [
                                {
                                    "start": "2026-07-20T18:00:00",
                                    "end": "2026-07-20T18:30:00",
                                }
                            ],
                        }
                    ],
                }
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
            "slots_per_team": 1,
        }
    )

    teams, rooms, slots_per_team = request_to_engine(req)

    assert teams == [
        Team(
            name="A",
            members=[
                Member(
                    name="hong",
                    unavailable=[
                        TimeInterval(
                            datetime(2026, 7, 20, 18, 0),
                            datetime(2026, 7, 20, 18, 30),
                        )
                    ],
                )
            ],
        )
    ]
    assert rooms == [
        Room(
            name="1번방",
            open_period=TimeInterval(
                datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0)
            ),
        )
    ]
    assert slots_per_team == 1
