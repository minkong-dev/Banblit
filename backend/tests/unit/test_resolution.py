from datetime import datetime

import pytest

from backend.scheduling.assignment import Room
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from conftest import resolve


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 20, hour, minute)


def _one_slot_room(room_id: int = 1) -> Room:
    return Room(id=room_id, open_period=TimeInterval(_at(18), _at(19)))


def test_successful_assignment_returns_no_proposals() -> None:
    team = Team(id=10, members=[Member(id=1, unavailable=[])])

    result = resolve(teams=[team], rooms=[_one_slot_room()], sessions_per_team=1)

    assert result.assignment.feasible is True
    assert result.proposals == []


def test_proposes_excluding_the_member_who_blocks_the_team() -> None:
    # slot(1시간 단위 시간 칸)이 유일한 것에 불가능 시간이 있으므로, 팀 전원 가능 조건을 충족하지 못합니다.
    blocker = Member(id=1, unavailable=[TimeInterval(_at(18), _at(19))])
    free = Member(id=2, unavailable=[])
    team = Team(id=10, members=[blocker, free])

    result = resolve(teams=[team], rooms=[_one_slot_room()], sessions_per_team=1)

    assert result.assignment.feasible is False
    assert [p.excluded_member for p in result.proposals] == [1]
    assert result.proposals[0].assignment.feasible is True


def test_does_not_propose_excluding_a_member_when_it_would_empty_their_team() -> None:
    # 팀에 한 명뿐이고 그 사람이 유일한 slot에 불가능 시간이 있으면, 제거하면 팀이 없어집니다.
    blocker = Member(id=1, unavailable=[TimeInterval(_at(18), _at(19))])
    team = Team(id=10, members=[blocker])

    result = resolve(teams=[team], rooms=[_one_slot_room()], sessions_per_team=1)

    assert result.assignment.feasible is False
    assert result.proposals == []


def test_no_proposals_when_no_single_exclusion_can_help() -> None:
    # 두 팀 모두 배정 가능하지만 slot이 하나뿐이므로, 누구를 제거해도 자리가 늘지 않습니다.
    team_a = Team(id=10, members=[Member(id=1, unavailable=[]), Member(id=2, unavailable=[])])
    team_b = Team(id=20, members=[Member(id=3, unavailable=[]), Member(id=4, unavailable=[])])

    result = resolve(teams=[team_a, team_b], rooms=[_one_slot_room()], sessions_per_team=1)

    assert result.assignment.feasible is False
    assert result.proposals == []


def test_fails_when_the_proposal_search_exceeds_the_time_limit() -> None:
    # 배정이 불가능하면 멤버 1명씩 제외한 계산을 멤버 수만큼 반복하므로 시간이 멤버 수에 비례합니다.
    # 상한을 넘기면 지금까지의 조율안을 버리고 실패로 끝냅니다.
    blocker = Member(id=1, unavailable=[TimeInterval(_at(18), _at(19))])
    free = Member(id=2, unavailable=[])
    team = Team(id=10, members=[blocker, free])

    with pytest.raises(ValueError, match="중단했습니다"):
        resolve(
            teams=[team],
            rooms=[_one_slot_room()],
            sessions_per_team=1,
            resolution_time_limit_seconds=0.0,
        )
