"""팀마다 합주실의 빈 시간을 target_sessions 회까지 배정합니다. OR-Tools 의 CP-SAT(제약 조건을 전부 충족하는 값의 조합을 찾는 solver)를 사용합니다.

model.add(식) 안의 == 와 <= 는 비교가 아니라 해가 충족해야 하는 제약입니다.

용어: slot 은 slot_minutes 길이의 시간 칸, session 은 session_minutes 동안 이어지는 합주 1회, 격자는 합주실 개방 시각부터
slot_minutes 간격으로 놓인 시각입니다. open_slots 는 어느 session 도 차지하지 않은 slot 입니다.
"""

import threading
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from ortools.sat.python import cp_model

from backend.scheduling.availability import Team, absent_member_ids
from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_sessions, generate_slots


class _StopWhenStalled(cp_model.CpSolverSolutionCallback):
    """solver 가 더 나은 해를 stall_seconds 초 동안 찾지 못하면 계산을 멈추는 timer 를 겁니다.

    solver 는 목적식 값이 나아진 해를 찾을 때마다 on_solution_callback 을 부릅니다. 부를 때마다 앞의 timer 를 취소하고
    새 timer 를 겁니다. timer 는 별도 thread 에서 stop_search 를 불러 계산을 중단합니다(stop_search 는 다른 thread 에서
    불러도 됩니다). daemon=True 는 프로세스가 끝날 때 이 thread 가 남아 있어도 종료를 막지 않게 합니다.
    """

    def __init__(self, solver: cp_model.CpSolver, stall_seconds: float) -> None:
        super().__init__()
        self._solver = solver
        self._stall_seconds = stall_seconds
        self._timer: threading.Timer | None = None

    def on_solution_callback(self) -> None:
        self.cancel()
        # stop_search 를 괄호 없이 넘깁니다. timer 가 만료될 때 부를 함수 자체를 전달하는 것입니다.
        self._timer = threading.Timer(self._stall_seconds, self._solver.stop_search)
        self._timer.daemon = True
        self._timer.start()

    def cancel(self) -> None:
        if self._timer is not None:
            self._timer.cancel()


@dataclass(frozen=True)
class Room:
    """합주실이 한 번 개방하는 시간 구간입니다. 같은 합주실을 여러 날 개방하면 날마다 하나씩 전달됩니다."""

    id: int
    open_period: TimeInterval


@dataclass(frozen=True)
class RoomInterval:
    """어느 합주실의 어느 시간 구간인지를 나타냅니다. room_id 와 interval 이 구간 하나를 유일하게 식별합니다.

    배정 결과에서는 session(합주 1회가 이어지는 구간) 하나이고, open_slots 에서는 slot(점유 단위
    길이의 시간 칸) 하나입니다. 두 구간의 길이는 다르지만 합주실 번호와 시간 구간이라는 구성은 같습니다.
    """

    room_id: int
    interval: TimeInterval


@dataclass
class Assignment:
    """배정 결과입니다. absences 는 불참자가 있는 session 과 불참 멤버 번호를 팀별로 담고, 불참자가 없는 팀은 key 가 없습니다."""

    sessions_by_team: dict[int, list[RoomInterval]]
    open_slots: list[RoomInterval]
    absences: dict[int, list[tuple[RoomInterval, list[int]]]]


def _build_room_slots(rooms: list[Room], slot_minutes: int) -> list[RoomInterval]:
    # rooms 의 개방 시간 구간을 generate_slots 로 slot(시간 칸)으로 분할하여 하나의 목록으로 통합합니다.
    # 같은 slot 이 중복으로 나타나면 즉시 거부합니다. slot 하나가 두 번 세어지면
    # slot 하나에는 팀 하나만이라는 제약이 두 팀을 같은 slot 에 배정하는 것을 막지 못하기 때문입니다.
    room_slots: list[RoomInterval] = []
    seen: set[RoomInterval] = set()
    for room in rooms:
        try:
            intervals = generate_slots(room.open_period, slot_minutes)
        except ValueError as error:
            # generate_slots 가 발생시킨 error 에 합주실 번호를 붙여 다시 발생시킵니다.
            raise ValueError(
                f"{room.id}번 합주실의 운영 시간이 잘못되었어요: {error}"
            ) from error
        for interval in intervals:
            room_slot = RoomInterval(room_id=room.id, interval=interval)
            if room_slot in seen:
                raise ValueError(
                    f"{room.id}번 합주실의 운영 시간이 겹쳐요: "
                    f"{interval.start} ~ {interval.end}"
                )
            seen.add(room_slot)
            room_slots.append(room_slot)
    return room_slots


def _build_room_sessions(
    rooms: list[Room], slot_minutes: int, session_minutes: int
) -> list[RoomInterval]:
    # rooms 의 개방 시간 구간마다 generate_sessions 로 session 후보를 만들어 하나의 목록으로 통합합니다.
    # 같은 합주실 안에서 후보끼리 겹치므로 중복 검사는 하지 않습니다. 격자와 중복 검사는
    # _build_room_slots 가 같은 rooms 를 대상으로 이미 수행합니다.
    room_sessions: list[RoomInterval] = []
    for room in rooms:
        for interval in generate_sessions(
            room.open_period, slot_minutes, session_minutes
        ):
            room_sessions.append(RoomInterval(room_id=room.id, interval=interval))
    return room_sessions


def _covered_slots(
    room_sessions: list[RoomInterval], slot_minutes: int
) -> dict[int, list[RoomInterval]]:
    """session 후보 하나가 차지하는 slot 목록을 후보 번호별로 반환합니다.

    session 은 칸의 배수 길이이고 시작이 격자 위에 있으므로, session 구간을 다시 분할하면
    그 session 이 차지하는 칸이 나옵니다.
    """
    covered: dict[int, list[RoomInterval]] = {}
    for index, room_session in enumerate(room_sessions):
        covered[index] = [
            RoomInterval(room_id=room_session.room_id, interval=interval)
            for interval in generate_slots(room_session.interval, slot_minutes)
        ]
    return covered


def _validate(teams: list[Team], target_sessions: int, max_absent: int) -> None:
    """번호는 대상을 유일하게 식별해야 합니다. 중복되면 결과에서 대상을 구분할 수 없기 때문입니다."""
    if target_sessions < 0:
        raise ValueError("팀당 배정 개수는 음수일 수 없어요")
    if max_absent < 0:
        raise ValueError("불참 허용 인원은 음수일 수 없어요")

    team_counts = Counter(team.id for team in teams)
    duplicated_teams = {team_id for team_id, count in team_counts.items() if count > 1}
    if duplicated_teams:
        raise ValueError(
            f"팀 번호가 겹쳐요: {', '.join(str(i) for i in sorted(duplicated_teams))}"
        )

    for team in teams:
        if not team.members:
            raise ValueError(f"{team.id}번 팀에 멤버가 없어요")
        member_counts = Counter(member.id for member in team.members)
        duplicated_members = {
            member_id for member_id, count in member_counts.items() if count > 1
        }
        if duplicated_members:
            raise ValueError(
                f"{team.id}번 팀 명단에 같은 사람이 두 번 있어요: "
                f"{', '.join(str(i) for i in sorted(duplicated_members))}"
            )


def assign(
    teams: list[Team],
    rooms: list[Room],
    target_sessions: int,
    slot_minutes: int,
    session_minutes: int,
    solver_time_limit_seconds: float,
    stall_seconds: float,
    daily_max_minutes: int | None = None,
    max_consecutive_minutes: int | None = None,
    max_absent: int = 0,
    num_workers: int = 0,
) -> Assignment:
    """각 팀에 빈 합주실 session 을 target_sessions 회까지, 가장 적게 받은 팀부터 배정합니다.

    solver_time_limit_seconds, stall_seconds, num_workers(0 이면 OR-Tools 기본값인 코어 수)는 pipeline.py 가 전달합니다.
    max_absent 는 session 1회에서 불가능 일정으로 빠져도 되는 팀원 수의 상한입니다.
    daily_max_minutes, max_consecutive_minutes 는 팀 1개의 하루 배정 시간 상한과 연속 배정 시간 상한이고, None 이면 상한을 두지 않습니다.

    slot 1개에는 팀 1개, 팀 1개는 같은 시각에 합주실 1곳, 멤버 1명은 같은 시각에 팀 1개에만 배정됩니다.
    open_slots 는 어느 session 도 차지하지 않은 slot 입니다.
    """
    _validate(teams, target_sessions, max_absent)
    room_slots = _build_room_slots(rooms, slot_minutes)
    room_sessions = _build_room_sessions(rooms, slot_minutes, session_minutes)
    covered = _covered_slots(room_sessions, slot_minutes)

    model = cp_model.CpModel()
    chosen, absent = _session_vars(model, teams, room_sessions, target_sessions, max_absent)
    indices_by_slot = _indices_by_slot(covered)
    indices_by_interval = _indices_by_interval(indices_by_slot)
    _one_team_per_slot(model, chosen, teams, indices_by_slot)
    _one_room_per_team(model, chosen, teams, indices_by_interval)
    _one_place_per_member(model, chosen, absent, teams, indices_by_interval)
    if daily_max_minutes is not None:
        _limit_per_day(model, chosen, room_sessions, daily_max_minutes // session_minutes)
    if max_consecutive_minutes is not None:
        _limit_consecutive(model, chosen, room_sessions, max_consecutive_minutes // session_minutes, session_minutes)
    joined = _back_to_back_pairs(model, chosen, room_sessions)
    _objective(model, chosen, absent, joined, teams, target_sessions, max_absent)

    solver = _solve(model, solver_time_limit_seconds, stall_seconds, num_workers)

    sessions_by_team: dict[int, list[RoomInterval]] = {}
    absences: dict[int, list[tuple[RoomInterval, list[int]]]] = {}
    taken: set[RoomInterval] = set()
    for team in teams:
        picked = _picked_indices(solver, chosen, team.id)
        for index in picked:
            taken.update(covered[index])
        sessions_by_team[team.id] = [room_sessions[index] for index in picked]
        missing = [(room_sessions[index], absent[(team.id, index)]) for index in picked if absent[(team.id, index)]]
        if missing:
            absences[team.id] = missing

    open_slots = [room_slot for room_slot in room_slots if room_slot not in taken]
    return Assignment(sessions_by_team=sessions_by_team, open_slots=open_slots, absences=absences)


# key 는 (팀 번호, session 후보 번호), value 는 그 팀이 그 후보를 쓰면 1, 아니면 0 인 model 변수입니다.
Chosen = dict[tuple[int, int], cp_model.IntVar]
# key 는 Chosen 과 같은 (팀 번호, session 후보 번호), value 는 그 후보 시각에 불가능 일정이 있는 팀원 번호 목록입니다.
Absent = dict[tuple[int, int], list[int]]


def _session_vars(
    model: cp_model.CpModel,
    teams: list[Team],
    room_sessions: list[RoomInterval],
    target_sessions: int,
    max_absent: int,
) -> tuple[Chosen, Absent]:
    """팀마다 불참자가 max_absent 명 이하인 session 후보에 변수를 만들고, 팀당 선택 수가 target_sessions 이하라는 제약을 겁니다.
    """
    chosen: Chosen = {}
    absent: Absent = {}
    for team in teams:
        own: list[cp_model.IntVar] = []
        for index, room_session in enumerate(room_sessions):
            missing = absent_member_ids(team, room_session.interval)
            if len(missing) > max_absent:
                continue
            var = model.new_bool_var(f"chosen_{team.id}_{index}")
            chosen[(team.id, index)] = var
            absent[(team.id, index)] = missing
            own.append(var)
        model.add(cp_model.LinearExpr.sum(own) <= target_sessions)
    return chosen, absent


def _indices_by_slot(covered: dict[int, list[RoomInterval]]) -> dict[RoomInterval, list[int]]:
    """slot(칸)마다 그 칸을 차지하는 session 후보 번호 목록을 반환합니다. """
    indices_by_slot: dict[RoomInterval, list[int]] = defaultdict(list)
    for index, room_slots_of_session in covered.items():
        for room_slot in room_slots_of_session:
            indices_by_slot[room_slot].append(index)
    return indices_by_slot


def _indices_by_interval(indices_by_slot: dict[RoomInterval, list[int]]) -> dict[TimeInterval, list[int]]:
    """합주실 번호를 뺀 시간 구간마다 후보 번호 목록을 반환합니다."""
    indices_by_interval: dict[TimeInterval, list[int]] = defaultdict(list)
    for room_slot, indices in indices_by_slot.items():
        indices_by_interval[room_slot.interval].extend(indices)
    return indices_by_interval


def _vars_of(chosen: Chosen, team_ids: list[int], indices: list[int]) -> list[cp_model.IntVar]:
    """team_ids 의 팀과 indices 의 후보 조합 중 변수가 있는 것만 모아 반환합니다."""
    variables: list[cp_model.IntVar] = []
    for team_id in team_ids:
        for index in indices:
            if (team_id, index) in chosen:
                variables.append(chosen[(team_id, index)])
    return variables


def _one_team_per_slot(
    model: cp_model.CpModel, chosen: Chosen, teams: list[Team], indices_by_slot: dict[RoomInterval, list[int]]
) -> None:
    """칸 하나에는 팀 하나만 배정됩니다."""
    team_ids = [team.id for team in teams]
    for indices in indices_by_slot.values():
        _at_most_one(model, _vars_of(chosen, team_ids, indices))


def _one_room_per_team(
    model: cp_model.CpModel, chosen: Chosen, teams: list[Team], indices_by_interval: dict[TimeInterval, list[int]]
) -> None:
    """하나의 팀은 같은 시각에 합주실 한 곳에만 배정될 수 있습니다."""
    for indices in indices_by_interval.values():
        for team in teams:
            _at_most_one(model, _vars_of(chosen, [team.id], indices))


def _one_place_per_member(
    model: cp_model.CpModel,
    chosen: Chosen,
    absent: Absent,
    teams: list[Team],
    indices_by_interval: dict[TimeInterval, list[int]],
) -> None:
    """여러 팀에 속한 멤버는 같은 시각에 한 팀에만 있습니다. 팀이 하나뿐인 멤버는 제약이 필요 없습니다.
    """
    teams_by_member: dict[int, list[int]] = defaultdict(list)
    for team in teams:
        for member in team.members:
            teams_by_member[member.id].append(team.id)
    for member_id, team_ids in teams_by_member.items():
        if len(team_ids) < 2:
            continue
        for indices in indices_by_interval.values():
            # 이 멤버가 참석하는 (팀, session) 변수만 모읍니다. 불참하는 session 은 같은 시각에 있어도 겹치지 않습니다.
            present = []
            for team_id in team_ids:
                for index in indices:
                    if (team_id, index) not in chosen:
                        continue
                    if member_id in absent[(team_id, index)]:
                        continue
                    present.append(chosen[(team_id, index)])
            _at_most_one(model, present)


def _solve(
    model: cp_model.CpModel, solver_time_limit_seconds: float, stall_seconds: float, num_workers: int
) -> cp_model.CpSolver:
    """model 을 풀고 해를 담은 solver 를 반환합니다.

    모든 변수가 0 인 해가 항상 조건을 충족하므로 해가 없는 경우는 없습니다. 시간 상한 안에 해를 1개도 찾지
    못하면 ValueError 를 발생시켜 배정 작업(job)을 실패로 끝냅니다.
    """
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = solver_time_limit_seconds
    solver.parameters.num_workers = num_workers
    stopper = _StopWhenStalled(solver, stall_seconds)
    # 계산 중 오류가 나도 timer 를 취소합니다. 남겨 두면 끝난 계산에 timer 만료 시 stop_search 를 부릅니다.
    try:
        status = solver.solve(model, stopper)
    finally:
        stopper.cancel()
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise ValueError("배정 계산이 시간 상한 안에 끝나지 않았어요")
    return solver


def _picked_indices(solver: cp_model.CpSolver, chosen: Chosen, team_id: int) -> list[int]:
    """해에서 team_id 의 팀이 쓰기로 된 session 후보 번호를 후보 번호 순서로 반환합니다."""
    picked: list[int] = []
    for (chosen_team_id, index), var in chosen.items():
        if chosen_team_id == team_id and solver.value(var) == 1:
            picked.append(index)
    return picked


def _limit_per_day(
    model: cp_model.CpModel,
    chosen: Chosen,
    room_sessions: list[RoomInterval],
    most: int,
) -> None:
    """팀마다 하루에 배정되는 session 수를 most 이하로 묶습니다. 날짜는 session 시작일입니다."""
    by_day: dict[tuple[int, date], list[cp_model.IntVar]] = defaultdict(list)
    for (team_id, index), var in chosen.items():
        by_day[(team_id, room_sessions[index].interval.start.date())].append(var)
    for variables in by_day.values():
        # 그날의 후보가 most 개 이하이면 "합이 most 이하" 제약은 항상 충족되므로 추가하지 않습니다.
        if len(variables) > most:
            model.add(cp_model.LinearExpr.sum(variables) <= most)


def _limit_consecutive(
    model: cp_model.CpModel,
    chosen: Chosen,
    room_sessions: list[RoomInterval],
    most: int,
    session_minutes: int,
) -> None:
    """팀마다 끊기지 않고 이어지는 session 수를 most 이하로 묶습니다. 합주실을 옮겨 이어지는 것도 이어진 것으로 봅니다.

    시작 시각 t 마다 t, t+1회, …, t+most회 의 (most+1)개 시작 시각에 걸린 변수의 합이 most 이하입니다.
    같은 시각의 후보는 _one_room_per_team 이 1개로 묶으므로, 이 합이 most+1 이면 그 팀이 (most+1)회를 이어 쓴 것입니다.
    """
    step = timedelta(minutes=session_minutes)
    by_start: dict[tuple[int, datetime], list[cp_model.IntVar]] = defaultdict(list)
    for (team_id, index), var in chosen.items():
        by_start[(team_id, room_sessions[index].interval.start)].append(var)
    for (team_id, start), first in by_start.items():
        chain = list(first)
        for count in range(1, most + 1):
            chain.extend(by_start.get((team_id, start + count * step), []))
        # 걸린 시작 시각이 most 개 이하이면 "합이 most 이하" 제약은 항상 충족되므로 추가하지 않습니다.
        if len(chain) > most:
            model.add(cp_model.LinearExpr.sum(chain) <= most)


def _back_to_back_pairs(
    model: cp_model.CpModel,
    chosen: Chosen,
    room_sessions: list[RoomInterval],
) -> list[cp_model.IntVar]:
    """같은 팀이 같은 합주실에서 바로 이어 쓰는 session 쌍마다, 두 session 이 모두 선택되었을 때만 1 이 될 수 있는 변수를 만들어 반환합니다.

    합주실을 옮겨 가며 이어지는 쌍은 세지 않습니다. 하루에 몰리는 것은 _limit_per_day 가 막습니다.
    """
    by_start: dict[tuple[int, int, datetime], cp_model.IntVar] = {}
    for (team_id, index), var in chosen.items():
        room_session = room_sessions[index]
        by_start[(team_id, room_session.room_id, room_session.interval.start)] = var

    joined: list[cp_model.IntVar] = []
    for (team_id, index), var in chosen.items():
        room_session = room_sessions[index]
        after = by_start.get((team_id, room_session.room_id, room_session.interval.end))
        if after is None:
            continue
        # both 는 두 session 이 모두 선택되었을 때만 1 이 될 수 있습니다. 최대화하므로 그때는 1 이 됩니다.
        both = model.new_bool_var(f"joined_{team_id}_{index}")
        model.add(both <= var)
        model.add(both <= after)
        joined.append(both)
    return joined


def _objective(
    model: cp_model.CpModel,
    chosen: Chosen,
    absent: Absent,
    joined: list[cp_model.IntVar],
    teams: list[Team],
    target_sessions: int,
    max_absent: int,
) -> None:
    """목적식 4개를 앞 항목이 우선하도록 가중치 합 1개로 묶어 maximize 합니다.

    1. 가장 적게 받은 팀의 횟수 2. 전체 배정 횟수 3. 불참 인원 합(최소화) 4. 이어지는 session 쌍 수.
    model 의 목적은 하나뿐이므로 maximize 는 여기서만 부릅니다. 각 가중치는 뒤 항목들이 가질 수 있는 최댓값의
    합보다 크게 잡아, 앞 항목을 1 늘리는 해가 뒤 항목과 관계없이 항상 더 좋게 합니다.
    """
    team_count = len(teams)
    w_absent = len(joined) + 1
    w_total = w_absent * (max_absent * target_sessions * team_count + 1)
    w_min = w_total * (target_sessions * team_count + 1)

    fewest = model.new_int_var(0, target_sessions, "fewest")
    for team in teams:
        own = [var for (team_id, _), var in chosen.items() if team_id == team.id]
        model.add(fewest <= cp_model.LinearExpr.sum(own))
    total = cp_model.LinearExpr.sum(list(chosen.values()))
    absent_sum = cp_model.LinearExpr.weighted_sum(
        list(chosen.values()), [len(absent[key]) for key in chosen]
    )
    model.maximize(w_min * fewest + w_total * total - w_absent * absent_sum + cp_model.LinearExpr.sum(joined))


def _at_most_one(model: cp_model.CpModel, variables: list[cp_model.IntVar]) -> None:
    # 변수가 1개 이하이면 "합이 1 이하" 제약은 항상 충족되므로 추가하지 않습니다.
    if len(variables) >= 2:
        model.add(sum(variables) <= 1)
