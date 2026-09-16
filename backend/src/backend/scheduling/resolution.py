from dataclasses import dataclass
from time import monotonic

from backend.scheduling.assignment import Assignment, Room, assign
from backend.scheduling.availability import Team
from backend.scheduling.slots import DEFAULT_SLOT_MINUTES

# 배정 작업(job) 1개 전체의 상한입니다. 배정이 불가능하면 멤버 1명씩 제외한 계산을 멤버 수만큼 반복하므로
# 실행 시간이 멤버 수에 비례합니다(solver 계산 1회당 SOLVER_TIME_LIMIT_SECONDS). 이 상한을 넘기면
# 조율안을 버리고 실패로 끝내, 해결되지 않는 입력 1개가 worker 를 무기한 점유하지 않게 합니다.
RESOLUTION_TIME_LIMIT_SECONDS = 300.0


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
    slot_minutes: int = DEFAULT_SLOT_MINUTES,
) -> Resolution:
    deadline = monotonic() + RESOLUTION_TIME_LIMIT_SECONDS
    base = assign(teams, rooms, slots_per_team, slot_minutes)
    if base.feasible:
        return Resolution(assignment=base, proposals=[])

    proposals: list[ExclusionProposal] = []
    for member_id in _member_ids(teams):
        # solver 계산 1회는 중단할 수 없으므로 계산과 계산 사이에서만 확인합니다. 따라서 실제
        # 중단 시각은 상한을 solver 계산 1회(최대 SOLVER_TIME_LIMIT_SECONDS)만큼 넘길 수 있습니다.
        if monotonic() >= deadline:
            raise ValueError("배정 계산이 시간 상한을 넘어 중단했습니다")
        reduced = _teams_without(teams, member_id)
        # 한 멤버를 제외했을 때 멤버가 0명인 팀이 생기면, 그 멤버를 제외한 계산은 조율안이 될 수 없으므로 건너뜁니다.
        if any(not team.members for team in reduced):
            continue
        trial = assign(reduced, rooms, slots_per_team, slot_minutes)
        if trial.feasible:
            proposals.append(
                ExclusionProposal(excluded_member=member_id, assignment=trial)
            )
    return Resolution(assignment=base, proposals=proposals)


def _member_ids(teams: list[Team]) -> list[int]:
    # 모든 팀의 멤버 번호를 중복 없이 수집하여 정렬해 반환합니다.
    ids: set[int] = set()
    for team in teams:
        for member in team.members:
            ids.add(member.id)
    return sorted(ids)


def _teams_without(teams: list[Team], excluded: int) -> list[Team]:
    # excluded 를 제외한 멤버 명단으로 팀을 새로 생성하여 반환합니다. 원본 팀은 수정하지 않습니다.
    reduced: list[Team] = []
    for team in teams:
        members = [m for m in team.members if m.id != excluded]
        reduced.append(Team(id=team.id, members=members))
    return reduced
