from datetime import datetime

from backend.api.mapping import request_to_engine, resolution_to_out
from backend.api.schemas import AssignRequest
from backend.scheduling.assignment import Room
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import resolve


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


def test_feasible_resolution_maps_to_out() -> None:
    room = Room(
        name="1번방",
        open_period=TimeInterval(
            datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 18, 30)
        ),
    )
    team = Team(name="A", members=[Member(name="hong", unavailable=[])])

    result = resolve(teams=[team], rooms=[room], slots_per_team=1)
    out = resolution_to_out(result)

    assert out.assignment.feasible is True
    assert out.assignment.slots_by_team["A"][0].room == "1번방"
    assert out.assignment.slots_by_team["A"][0].start == datetime(2026, 7, 20, 18, 0)
    assert out.assignment.slots_by_team["A"][0].end == datetime(2026, 7, 20, 18, 30)
    assert out.proposals == []


def test_infeasible_resolution_maps_proposals() -> None:
    # 유일한 칸에 blocker 가 불가능 → 실패하고, blocker 제외 조율안이 나온다.
    room = Room(
        name="1번방",
        open_period=TimeInterval(
            datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 18, 30)
        ),
    )
    blocker = Member(
        name="blocker",
        unavailable=[
            TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 18, 30))
        ],
    )
    free = Member(name="free", unavailable=[])
    team = Team(name="A", members=[blocker, free])

    result = resolve(teams=[team], rooms=[room], slots_per_team=1)
    out = resolution_to_out(result)

    assert out.assignment.feasible is False
    assert [p.excluded_member for p in out.proposals] == ["blocker"]
    assert out.proposals[0].assignment.feasible is True
