from datetime import datetime

from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import resolve


def test_successful_assignment_returns_no_proposals():
    slot_a = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    team = Team(name="A", members=[Member(name="hong", unavailable=[])])

    result = resolve(teams=[team], slots=[slot_a], slots_per_team=1, rooms=1)

    assert result.assignment.feasible is True
    assert result.proposals == []


def test_proposes_excluding_the_member_who_blocks_the_team():
    slot_a = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    # blocker 는 유일한 슬롯(slot_a)에 불가능 → 팀 전원 가능이 성립 못 함
    blocker = Member(name="blocker", unavailable=[slot_a])
    free = Member(name="free", unavailable=[])
    team = Team(name="A", members=[blocker, free])

    result = resolve(teams=[team], slots=[slot_a], slots_per_team=1, rooms=1)

    assert result.assignment.feasible is False
    assert [p.excluded_member for p in result.proposals] == ["blocker"]
    assert result.proposals[0].assignment.feasible is True


def test_does_not_propose_excluding_a_member_when_it_would_empty_their_team():
    slot_a = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    # 팀에 한 명뿐이고 그 사람이 유일한 슬롯에 불가능 → 배정 실패
    blocker = Member(name="blocker", unavailable=[slot_a])
    team = Team(name="A", members=[blocker])

    result = resolve(teams=[team], slots=[slot_a], slots_per_team=1, rooms=1)

    # 제외하면 팀이 텅 비므로, "빼면 된다"는 유효한 제안이 아니다
    assert result.assignment.feasible is False
    assert result.proposals == []


def test_no_proposals_when_no_single_exclusion_can_help():
    slot_a = TimeInterval(datetime(2026, 7, 20, 18, 0), datetime(2026, 7, 20, 19, 0))
    # 두 팀 모두 slot_a에 가능하지만 방이 1개 → 두 팀을 한 슬롯에 못 넣어 실패
    team_a = Team(name="A", members=[Member(name="a1", unavailable=[]), Member(name="a2", unavailable=[])])
    team_b = Team(name="B", members=[Member(name="b1", unavailable=[]), Member(name="b2", unavailable=[])])

    result = resolve(teams=[team_a, team_b], slots=[slot_a], slots_per_team=1, rooms=1)

    # 한 명 빼도 여전히 두 팀이 한 슬롯을 놓고 다툼 → 풀리지 않으므로 제안 없음
    assert result.assignment.feasible is False
    assert result.proposals == []

