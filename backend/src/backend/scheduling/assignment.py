from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

# 한 번의 계산에 허락하는 시간. 넘기면 지금까지 찾은 것으로 답합니다.
SOLVER_TIME_LIMIT_SECONDS = 60.0

from backend.scheduling.availability import Team, is_team_available
from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_slots


@dataclass(frozen=True)
class Room:
    """합주실이 한 번 개방하는 시간 구간입니다. 같은 합주실을 여러 날 개방하면 날마다 하나씩 전달됩니다."""

    id: int
    open_period: TimeInterval


@dataclass(frozen=True)
class RoomSlot:
    """어느 합주실의 어느 시간 slot(1시간 단위 시간 칸)인지를 나타냅니다. room_id 와 interval 이 slot 하나를 유일하게 식별합니다."""

    room_id: int
    interval: TimeInterval


@dataclass
class Assignment:
    feasible: bool
    slots_by_team: dict[int, list[RoomSlot]]
    open_slots: list[RoomSlot]


def _build_room_slots(rooms: list[Room]) -> list[RoomSlot]:
    # rooms 의 개방 시간 구간을 generate_slots 로 1시간 slot(1시간 단위 시간 칸)으로 분할하여 하나의 목록으로 통합합니다.
    # 같은 slot 이 중복으로 나타나면 즉시 거부합니다. slot 하나가 두 번 세어지면
    # slot 하나에는 팀 하나만이라는 제약이 두 팀을 같은 slot 에 배정하는 것을 막지 못하기 때문입니다.
    room_slots: list[RoomSlot] = []
    seen: set[RoomSlot] = set()
    for room in rooms:
        try:
            intervals = generate_slots(room.open_period)
        except ValueError as error:
            # generate_slots 가 발생시킨 error 에 합주실 번호를 붙여 다시 발생시킵니다.
            raise ValueError(
                f"{room.id}번 합주실의 운영 시간이 잘못되었습니다: {error}"
            ) from error
        for interval in intervals:
            room_slot = RoomSlot(room_id=room.id, interval=interval)
            if room_slot in seen:
                raise ValueError(
                    f"{room.id}번 합주실의 운영 시간이 겹칩니다: "
                    f"{interval.start} ~ {interval.end}"
                )
            seen.add(room_slot)
            room_slots.append(room_slot)
    return room_slots


def _validate(teams: list[Team], slots_per_team: int) -> None:
    """번호는 대상을 유일하게 식별해야 합니다. 중복되면 결과에서 대상을 구분할 수 없기 때문입니다."""
    if slots_per_team < 0:
        raise ValueError("팀당 배정 개수는 음수일 수 없습니다")

    team_ids = [team.id for team in teams]
    duplicated_teams = {team_id for team_id in team_ids if team_ids.count(team_id) > 1}
    if duplicated_teams:
        raise ValueError(
            f"팀 번호가 겹칩니다: {', '.join(str(i) for i in sorted(duplicated_teams))}"
        )

    for team in teams:
        if not team.members:
            raise ValueError(f"{team.id}번 팀에 멤버가 없습니다")
        member_ids = [member.id for member in team.members]
        duplicated_members = {
            member_id for member_id in member_ids if member_ids.count(member_id) > 1
        }
        if duplicated_members:
            raise ValueError(
                f"{team.id}번 팀 명단에 같은 사람이 두 번 있습니다: "
                f"{', '.join(str(i) for i in sorted(duplicated_members))}"
            )


def assign(
    teams: list[Team],
    rooms: list[Room],
    slots_per_team: int,
) -> Assignment:
    """각 팀에게, 그 팀이 가능한 시간의 빈 합주실을 필요한 개수만큼 배정합니다.

    slot(1시간 단위 시간 칸) 하나에는 팀 하나만 배정됩니다. 팀 하나는 같은 시간에
    여러 합주실을 동시에 사용할 수 없으며, 여러 팀에 속한 멤버도 같은 시간에
    한 곳에만 있을 수 있습니다. 조건을 모두 충족하는 배정안이 없을 경우
    feasible=False 를 반환합니다.
    """
    _validate(teams, slots_per_team)
    room_slots = _build_room_slots(rooms)

    model = cp_model.CpModel()

    chosen: dict[tuple[int, int], cp_model.IntVar] = {}
    for team in teams:
        for index, room_slot in enumerate(room_slots):
            var = model.new_bool_var(f"chosen_{team.id}_{index}")
            chosen[(team.id, index)] = var
            if not is_team_available(team, room_slot.interval):
                model.add(var == 0)
        model.add(
            sum(chosen[(team.id, i)] for i, _ in enumerate(room_slots)) == slots_per_team
        )

    for index, _ in enumerate(room_slots):
        model.add(sum(chosen[(team.id, index)] for team in teams) <= 1)

    indices_by_interval: dict[TimeInterval, list[int]] = defaultdict(list)
    for index, room_slot in enumerate(room_slots):
        indices_by_interval[room_slot.interval].append(index)

    for indices in indices_by_interval.values():
        if len(indices) < 2:
            continue
        for team in teams:
            model.add(sum(chosen[(team.id, i)] for i in indices) <= 1)

    teams_by_member: dict[int, list[int]] = defaultdict(list)
    for team in teams:
        for member in team.members:
            teams_by_member[member.id].append(team.id)
    for team_ids in teams_by_member.values():
        if len(team_ids) < 2:
            continue
        for indices in indices_by_interval.values():
            model.add(
                sum(chosen[(team_id, i)] for team_id in team_ids for i in indices) <= 1
            )

    solver = cp_model.CpSolver()
    # 시간 제한이 없으면 풀리지 않는 입력 하나가 worker 를 무한정 점유하게 됩니다.
    # 실측 최댓값(약 22초)의 3배 정도에서 중단하고, 그때까지 찾지 못했으면
    # feasible 이 아닌 것으로 취급합니다.
    solver.parameters.max_time_in_seconds = SOLVER_TIME_LIMIT_SECONDS
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Assignment(feasible=False, slots_by_team={}, open_slots=[])

    slots_by_team: dict[int, list[RoomSlot]] = {}
    taken: set[int] = set()
    for team in teams:
        picked = [
            index
            for index, _ in enumerate(room_slots)
            if solver.value(chosen[(team.id, index)]) == 1
        ]
        taken.update(picked)
        slots_by_team[team.id] = [room_slots[index] for index in picked]

    open_slots = [
        room_slot
        for index, room_slot in enumerate(room_slots)
        if index not in taken
    ]
    return Assignment(feasible=True, slots_by_team=slots_by_team, open_slots=open_slots)
