from datetime import datetime

from backend.scheduling.assignment import Room, RoomSlot, assign
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 7, 20, hour, minute)


def test_team_is_assigned_to_a_room_that_is_open_when_it_can_play():
    # 1번방은 18~19시, 2번방은 20~21시에 연다.
    room_a = Room(name="1번방", open_period=TimeInterval(_at(18), _at(19)))
    room_b = Room(name="2번방", open_period=TimeInterval(_at(20), _at(21)))
    # 팀은 18~19시에 불가능 → 2번방으로만 갈 수 있다.
    team = Team(name="A", members=[Member(name="hong", unavailable=[TimeInterval(_at(18), _at(19))])])

    result = assign(teams=[team], rooms=[room_a, room_b], slots_per_team=1)

    assert result.feasible is True
    # 2번방 안에서 어느 칸을 고를지는 엔진의 자유다. 방이 맞는지만 본다.
    assigned = result.slots_by_team["A"]
    assert len(assigned) == 1
    assert assigned[0].room == "2번방"
    assert assigned[0].interval.start >= _at(20)


def test_two_teams_cannot_take_the_same_slot_in_the_same_room():
    # 방 하나에 칸 하나뿐 → 두 팀이 동시에 들어갈 수 없다.
    room = Room(name="1번방", open_period=TimeInterval(_at(18), _at(18, 30)))
    team_a = Team(name="A", members=[Member(name="m1", unavailable=[])])
    team_b = Team(name="B", members=[Member(name="m2", unavailable=[])])

    result = assign(teams=[team_a, team_b], rooms=[room], slots_per_team=1)

    assert result.feasible is False


def test_two_teams_can_take_the_same_time_in_different_rooms():
    room_a = Room(name="1번방", open_period=TimeInterval(_at(18), _at(18, 30)))
    room_b = Room(name="2번방", open_period=TimeInterval(_at(18), _at(18, 30)))
    team_a = Team(name="A", members=[Member(name="m1", unavailable=[])])
    team_b = Team(name="B", members=[Member(name="m2", unavailable=[])])

    result = assign(teams=[team_a, team_b], rooms=[room_a, room_b], slots_per_team=1)

    assert result.feasible is True
    assigned_rooms = {
        result.slots_by_team["A"][0].room,
        result.slots_by_team["B"][0].room,
    }
    assert assigned_rooms == {"1번방", "2번방"}


def test_one_team_cannot_occupy_two_rooms_at_the_same_time():
    # 두 방 모두 18:00~18:30 한 칸만 열린다. 한 팀이 2칸을 받으려면
    # 같은 시간에 두 방을 동시에 써야 하므로 성립하지 않는다.
    room_a = Room(name="1번방", open_period=TimeInterval(_at(18), _at(18, 30)))
    room_b = Room(name="2번방", open_period=TimeInterval(_at(18), _at(18, 30)))
    team = Team(name="A", members=[Member(name="m1", unavailable=[])])

    result = assign(teams=[team], rooms=[room_a, room_b], slots_per_team=2)

    assert result.feasible is False


def test_shared_member_cannot_be_in_two_rooms_at_the_same_time():
    # 김씨가 두 팀에 모두 속한다. 방이 둘이어도 몸은 하나다.
    room_a = Room(name="1번방", open_period=TimeInterval(_at(18), _at(18, 30)))
    room_b = Room(name="2번방", open_period=TimeInterval(_at(18), _at(18, 30)))
    kim = Member(name="kim", unavailable=[])
    team_a = Team(name="A", members=[kim])
    team_b = Team(name="B", members=[kim])

    result = assign(teams=[team_a, team_b], rooms=[room_a, room_b], slots_per_team=1)

    assert result.feasible is False


def test_shared_member_can_practice_with_both_teams_at_different_times():
    # 이 서비스에서 가장 흔한 상황이다. 한 사람이 두 밴드에 속하고,
    # 서로 다른 시간에 각각 연습한다. 이건 반드시 성립해야 한다.
    room = Room(name="1번방", open_period=TimeInterval(_at(18), _at(19)))
    kim = Member(name="kim", unavailable=[])
    team_a = Team(name="A", members=[kim])
    team_b = Team(name="B", members=[kim])

    result = assign(teams=[team_a, team_b], rooms=[room], slots_per_team=1)

    assert result.feasible is True
    time_a = result.slots_by_team["A"][0].interval
    time_b = result.slots_by_team["B"][0].interval
    assert time_a != time_b


def test_leftover_slots_are_returned_as_open_slots():
    # 방 하나가 18~19시에 열어 칸이 둘인데, 팀은 하나만 쓴다 → 나머지 한 칸이 예약 가능 자리다.
    room = Room(name="1번방", open_period=TimeInterval(_at(18), _at(19)))
    team = Team(name="A", members=[Member(name="m1", unavailable=[])])

    result = assign(teams=[team], rooms=[room], slots_per_team=1)

    assert result.feasible is True
    taken = result.slots_by_team["A"][0]
    assert len(result.open_slots) == 1
    assert result.open_slots[0].room == "1번방"
    assert result.open_slots[0] != taken


def test_no_open_slots_when_every_slot_is_used():
    room = Room(name="1번방", open_period=TimeInterval(_at(18), _at(19)))
    team = Team(name="A", members=[Member(name="m1", unavailable=[])])

    result = assign(teams=[team], rooms=[room], slots_per_team=2)

    assert result.feasible is True
    assert result.open_slots == []


def test_open_slots_are_empty_when_assignment_fails():
    # 배정에 실패하면 예약 가능 자리를 말할 수 없다.
    room = Room(name="1번방", open_period=TimeInterval(_at(18), _at(18, 30)))
    team_a = Team(name="A", members=[Member(name="m1", unavailable=[])])
    team_b = Team(name="B", members=[Member(name="m2", unavailable=[])])

    result = assign(teams=[team_a, team_b], rooms=[room], slots_per_team=1)

    assert result.feasible is False
    assert result.open_slots == []
