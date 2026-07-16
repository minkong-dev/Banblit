from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from backend.scheduling.availability import Team, is_team_available
from backend.scheduling.interval import TimeInterval


@dataclass
class Assignment:
    feasible: bool
    slots_by_team: dict[str, list[TimeInterval]]


def assign(
    teams: list[Team],
    slots: list[TimeInterval],
    slots_per_team: int,
    rooms: int = 1,
) -> Assignment:
    """각 팀을, 그 팀이 가능한 슬롯 중에서 필요한 개수만큼 배정한다.

    한 슬롯에 동시에 들어갈 수 있는 팀 수는 합주실 수(rooms)를 넘지 못한다.
    조건을 모두 만족하는 배정을 찾지 못하면 feasible=False로 돌려준다.
    """
    model = cp_model.CpModel()

    chosen: dict[tuple[str, int], cp_model.IntVar] = {}
    for team in teams:
        for slot_index, slot in enumerate(slots):
            var = model.new_bool_var(f"chosen_{team.name}_{slot_index}")
            chosen[(team.name, slot_index)] = var
            if not is_team_available(team, slot):
                model.add(var == 0)
        model.add(
            sum(chosen[(team.name, i)] for i in range(len(slots))) == slots_per_team
        )

    for slot_index in range(len(slots)):
        model.add(
            sum(chosen[(team.name, slot_index)] for team in teams) <= rooms
        )

    teams_by_member: dict[str, list[str]] = defaultdict(list)
    for team in teams:
        for member in team.members:
            teams_by_member[member.name].append(team.name)
    for team_names in teams_by_member.values():
        if len(team_names) < 2:
            continue
        for slot_index in range(len(slots)):
            model.add(
                sum(chosen[(team_name, slot_index)] for team_name in team_names) <= 1
            )

    solver = cp_model.CpSolver()
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Assignment(feasible=False, slots_by_team={})

    slots_by_team: dict[str, list[TimeInterval]] = {}
    for team in teams:
        slots_by_team[team.name] = [
            slots[i]
            for i in range(len(slots))
            if solver.value(chosen[(team.name, i)]) == 1
        ]
    return Assignment(feasible=True, slots_by_team=slots_by_team)
