from datetime import datetime

import pytest

from backend.api.mapping import EngineNames, request_to_engine, resolution_to_out
from backend.api.schemas import AssignRequest
from backend.scheduling.assignment import Assignment, Room, RoomSlot
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import ExclusionProposal, Resolution


def _request(payload: dict) -> AssignRequest:
    return AssignRequest.model_validate(payload)


def test_request_maps_to_engine_objects() -> None:
    req = _request(
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

    teams, rooms, slots_per_team, names = request_to_engine(req)

    assert teams == [
        Team(
            id=0,
            members=[
                Member(
                    id=0,
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
            id=0,
            open_period=TimeInterval(
                datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0)
            ),
        )
    ]
    assert slots_per_team == 1
    assert names == EngineNames(teams=["A"], rooms=["1번방"], members=["hong"])


def test_the_same_person_in_two_teams_gets_one_number() -> None:
    # 엔진은 번호로 사람을 가른다. 두 팀에 걸친 한 사람이 두 번호를 받으면
    # 같은 시간에 두 방을 쓰는 배정을 막지 못한다.
    req = _request(
        {
            "teams": [
                {"name": "A", "members": [{"name": "hong", "unavailable": []}]},
                {"name": "B", "members": [{"name": "hong", "unavailable": []}]},
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

    teams, _, _, names = request_to_engine(req)

    assert teams[0].members[0].id == teams[1].members[0].id
    assert names.members == ["hong"]


def test_duplicate_team_names_are_rejected() -> None:
    # 답장이 팀 이름으로 결과를 묶으므로, 이름이 겹치면 한 팀의 시간표가 사라진다.
    req = _request(
        {
            "teams": [
                {"name": "A", "members": [{"name": "m1", "unavailable": []}]},
                {"name": "A", "members": [{"name": "m2", "unavailable": []}]},
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

    with pytest.raises(ValueError, match="팀 이름이 겹칩니다"):
        request_to_engine(req)


def test_bad_operating_hours_are_reported_with_the_room_name() -> None:
    # 엔진이 붙이는 번호는 요청 안의 자리번호라 부르는 쪽에 뜻이 없다.
    req = _request(
        {
            "teams": [{"name": "A", "members": [{"name": "m1", "unavailable": []}]}],
            "rooms": [
                {
                    "name": "1번방",
                    "open_period": {
                        "start": "2026-07-20T18:07:00",
                        "end": "2026-07-20T19:00:00",
                    },
                }
            ],
            "slots_per_team": 1,
        }
    )

    with pytest.raises(ValueError, match="'1번방' 방의 운영 시간"):
        request_to_engine(req)


def _one_slot() -> RoomSlot:
    return RoomSlot(
        room_id=0,
        interval=TimeInterval(
            datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 18, 30)
        ),
    )


NAMES = EngineNames(teams=["A"], rooms=["1번방"], members=["blocker", "free"])


def test_feasible_resolution_maps_to_out() -> None:
    # 엔진을 실제로 돌리지 않는다. 엔진이 깨졌을 때 변환 검사까지 빨간불이 되면
    # 어느 쪽이 원인인지 갈라낼 수 없다.
    result = Resolution(
        assignment=Assignment(
            feasible=True, slots_by_team={0: [_one_slot()]}, open_slots=[]
        ),
        proposals=[],
    )

    out = resolution_to_out(result, NAMES)

    assert out.assignment.feasible is True
    assert out.assignment.slots_by_team["A"][0].room == "1번방"
    assert out.assignment.slots_by_team["A"][0].start == datetime(2026, 7, 20, 18, 0)
    assert out.assignment.slots_by_team["A"][0].end == datetime(2026, 7, 20, 18, 30)
    assert out.proposals == []


def test_infeasible_resolution_maps_proposals() -> None:
    # 엔진이 내놓는 실패 결과(조율안 하나)를 손으로 세워 변환만 검사한다.
    result = Resolution(
        assignment=Assignment(feasible=False, slots_by_team={}, open_slots=[]),
        proposals=[
            ExclusionProposal(
                excluded_member=0,
                assignment=Assignment(
                    feasible=True, slots_by_team={0: [_one_slot()]}, open_slots=[]
                ),
            )
        ],
    )

    out = resolution_to_out(result, NAMES)

    assert out.assignment.feasible is False
    assert [p.excluded_member for p in out.proposals] == ["blocker"]
    assert out.proposals[0].assignment.feasible is True
