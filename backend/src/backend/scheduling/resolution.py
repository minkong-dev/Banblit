from dataclasses import dataclass

from backend.scheduling.assignment import Assignment, assign
from backend.scheduling.availability import Team
from backend.scheduling.interval import TimeInterval


@dataclass
class ExclusionProposal:
    excluded_member: str
    assignment: Assignment


@dataclass
class Resolution:
    assignment: Assignment
    proposals: list[ExclusionProposal]


def resolve(
    teams: list[Team],
    slots: list[TimeInterval],
    slots_per_team: int,
    rooms: int = 1,
) -> Resolution:
    base = assign(teams, slots, slots_per_team, rooms)
    if base.feasible:
        return Resolution(assignment=base, proposals=[])

    proposals: list[ExclusionProposal] = []
    member_names = sorted({m.name for team in teams for m in team.members})
    for name in member_names:
        reduced = [
            Team(name=team.name, members=[m for m in team.members if m.name != name])
            for team in teams
        ]
        # 제외했더니 어느 팀이든 텅 비어버리면, 그건 "빼서 푸는" 유효한 제안이 아니다.
        if any(len(team.members) == 0 for team in reduced):
            continue
        trial = assign(reduced, slots, slots_per_team, rooms)
        if trial.feasible:
            proposals.append(ExclusionProposal(excluded_member=name, assignment=trial))
    return Resolution(assignment=base, proposals=proposals)
