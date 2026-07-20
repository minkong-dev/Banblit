from collections import defaultdict
from dataclasses import dataclass, field

from ortools.sat.python import cp_model

from backend.scheduling.availability import Team, is_team_available
from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_slots


@dataclass(frozen=True)
class Room:
    """합주실 하나. 방마다 여는 시간이 다를 수 있다."""

    name: str
    open_period: TimeInterval


@dataclass(frozen=True)
class RoomSlot:
    """어느 방의 어느 시간 칸인지."""

    room: str
    interval: TimeInterval


@dataclass
class Assignment:
    feasible: bool
    slots_by_team: dict[str, list[RoomSlot]]
    open_slots: list[RoomSlot] = field(default_factory=list)


def _build_room_slots(rooms: list[Room]) -> list[RoomSlot]:
    room_slots: list[RoomSlot] = []
    for room in rooms:
        try:
            intervals = generate_slots(room.open_period)
        except ValueError as error:
            # 어느 방이 잘못됐는지 알려주지 않으면 방이 많을 때 원인을 찾을 수 없다.
            raise ValueError(f"'{room.name}' 방의 운영 시간이 잘못되었습니다: {error}") from error
        for interval in intervals:
            room_slots.append(RoomSlot(room=room.name, interval=interval))
    return room_slots


def _validate(teams: list[Team], rooms: list[Room], slots_per_team: int) -> None:
    """이름은 사람이 붙이는 식별자다. 겹치면 결과에서 서로를 구분할 수 없다."""
    if slots_per_team < 0:
        raise ValueError("팀당 배정 개수는 음수일 수 없습니다")

    room_names = [room.name for room in rooms]
    duplicated_rooms = {name for name in room_names if room_names.count(name) > 1}
    if duplicated_rooms:
        raise ValueError(f"합주실 이름이 겹칩니다: {', '.join(sorted(duplicated_rooms))}")

    team_names = [team.name for team in teams]
    duplicated_teams = {name for name in team_names if team_names.count(name) > 1}
    if duplicated_teams:
        raise ValueError(f"팀 이름이 겹칩니다: {', '.join(sorted(duplicated_teams))}")

    for team in teams:
        if not team.members:
            raise ValueError(f"'{team.name}' 팀에 멤버가 없습니다")
        member_names = [member.name for member in team.members]
        duplicated_members = {
            name for name in member_names if member_names.count(name) > 1
        }
        if duplicated_members:
            raise ValueError(
                f"'{team.name}' 팀 명단에 같은 사람이 두 번 있습니다: "
                f"{', '.join(sorted(duplicated_members))}"
            )


def assign(
    teams: list[Team],
    rooms: list[Room],
    slots_per_team: int,
) -> Assignment:
    """각 팀에게, 그 팀이 가능한 시간의 빈 방을 필요한 개수만큼 배정한다.

    한 방의 한 칸에는 팀 하나만 들어간다. 한 팀이 같은 시간에 두 방을 쓸 수 없고,
    여러 팀에 속한 사람도 같은 시간에 한 곳에만 있을 수 있다.
    조건을 모두 만족하는 배정을 찾지 못하면 feasible=False로 돌려준다.
    """
    _validate(teams, rooms, slots_per_team)
    room_slots = _build_room_slots(rooms)

    model = cp_model.CpModel()

    chosen: dict[tuple[str, int], cp_model.IntVar] = {}
    for team in teams:
        for index, room_slot in enumerate(room_slots):
            var = model.new_bool_var(f"chosen_{team.name}_{index}")
            chosen[(team.name, index)] = var
            if not is_team_available(team, room_slot.interval):
                model.add(var == 0)
        model.add(
            sum(chosen[(team.name, i)] for i in range(len(room_slots)))
            == slots_per_team
        )

    # 한 방의 한 칸에는 팀 하나만 들어간다.
    for index in range(len(room_slots)):
        model.add(sum(chosen[(team.name, index)] for team in teams) <= 1)

    indices_by_interval: dict[TimeInterval, list[int]] = defaultdict(list)
    for index, room_slot in enumerate(room_slots):
        indices_by_interval[room_slot.interval].append(index)

    # 한 팀은 같은 시간에 여러 방을 동시에 쓸 수 없다.
    for indices in indices_by_interval.values():
        if len(indices) < 2:
            continue
        for team in teams:
            model.add(sum(chosen[(team.name, i)] for i in indices) <= 1)

    # 여러 팀에 속한 사람은 같은 시간에 한 곳에만 있을 수 있다.
    teams_by_member: dict[str, list[str]] = defaultdict(list)
    for team in teams:
        for member in team.members:
            teams_by_member[member.name].append(team.name)
    for team_names in teams_by_member.values():
        if len(team_names) < 2:
            continue
        for indices in indices_by_interval.values():
            model.add(
                sum(chosen[(team_name, i)] for team_name in team_names for i in indices)
                <= 1
            )

    solver = cp_model.CpSolver()
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Assignment(feasible=False, slots_by_team={}, open_slots=[])

    slots_by_team: dict[str, list[RoomSlot]] = {}
    taken: set[int] = set()
    for team in teams:
        picked = [
            index
            for index in range(len(room_slots))
            if solver.value(chosen[(team.name, index)]) == 1
        ]
        taken.update(picked)
        slots_by_team[team.name] = [room_slots[index] for index in picked]

    open_slots = [
        room_slot
        for index, room_slot in enumerate(room_slots)
        if index not in taken
    ]
    return Assignment(
        feasible=True, slots_by_team=slots_by_team, open_slots=open_slots
    )
