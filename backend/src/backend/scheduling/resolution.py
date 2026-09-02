from dataclasses import dataclass

from backend.scheduling.assignment import Assignment, Room, assign
from backend.scheduling.availability import Team


@dataclass
class ExclusionProposal:
    excluded_member: int
    assignment: Assignment


@dataclass
class Resolution:
    assignment: Assignment
    proposals: list[ExclusionProposal]


def resolve(
    teams: list[Team],
    rooms: list[Room],
    slots_per_team: int,
) -> Resolution:
    base = assign(teams, rooms, slots_per_team)
    if base.feasible:
        return Resolution(assignment=base, proposals=[])

    proposals: list[ExclusionProposal] = []
    for member_id in _member_ids(teams):
        reduced = _teams_without(teams, member_id)
        # 한 명을 뺐더니 텅 빈 팀이 생기면 "빼서 푸는" 제안이 아니므로 넘어간다.
        if any(not team.members for team in reduced):
            continue
        trial = assign(reduced, rooms, slots_per_team)
        if trial.feasible:
            proposals.append(
                ExclusionProposal(excluded_member=member_id, assignment=trial)
            )
    return Resolution(assignment=base, proposals=proposals)


def _member_ids(teams: list[Team]) -> list[int]:
    # 여러 팀에 걸친 사람이 두 번 나오지 않도록 번호를 모아 정렬해 돌려준다.
    ids: set[int] = set()
    for team in teams:
        for member in team.members:
            ids.add(member.id)
    return sorted(ids)


def _teams_without(teams: list[Team], excluded: int) -> list[Team]:
    # excluded 를 뺀 명단으로 팀을 새로 만들어 돌려준다. 원본 팀은 고치지 않는다.
    reduced: list[Team] = []
    for team in teams:
        members = [m for m in team.members if m.id != excluded]
        reduced.append(Team(id=team.id, members=members))
    return reduced
