"""팀마다 합주실의 빈 시간을 sessions_per_team 회씩 배정하는 계산입니다.

Banblit 은 밴드 동아리의 합주 일정 관리 서비스입니다. 팀(밴드)이 합주실(연습 공간)을 나눠 쓰고, 이 파일이 그 배정을
계산합니다. 계산은 OR-Tools 의 CP-SAT(제약 조건을 전부 충족하는 값의 조합을 찾는 해결기)로 합니다.

CP-SAT 모델은 4가지로 이루어집니다.
- 변수: "팀 T 가 session 후보 i 를 쓴다" 를 뜻하는 0/1 값. new_bool_var 가 만들고, 이름 문자열은 solver 로그에만 쓰입니다.
- 제약: 변수 사이의 조건. model.add(식 == 값) 의 == 는 비교가 아니라 "이 등식이 성립해야 한다" 는 조건입니다.
  cp_model.LinearExpr.sum 은 변수의 합을 뜻하는 식이고, 파이썬 sum 도 변수에 쓰면 같은 식이 됩니다.
- 목적: 최대화할 식(model.maximize). 없으면 조건을 충족하는 아무 해나 반환합니다.
- 해: solver.solve 가 찾은 변수 값의 조합. solver.value(변수) 로 읽습니다. 상태가 OPTIMAL(최적 증명) 또는
  FEASIBLE(조건 충족, 최적 미증명)이면 해가 있고, INFEASIBLE(조건을 충족하는 조합 없음)·UNKNOWN(시간 안에 못 찾음)이면 없습니다.

용어: slot 은 점유 단위(설정의 slot_minutes)만큼의 시간 칸, session 은 합주 1회(session_minutes)가 이어지는 구간,
격자는 합주실 개방 시각부터 slot_minutes 간격으로 놓인 시각의 나열입니다. 선착순 예약은 배정과 별개로 멤버가 빈 칸을
직접 잡는 기능이고, 배정 결과의 open_slots 가 그 대상입니다.
"""

import threading
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime

from ortools.sat.python import cp_model

from backend.scheduling.availability import Team, is_team_available
from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_sessions, generate_slots


class _StopAfterFirst(cp_model.CpSolverSolutionCallback):
    """solver 가 첫 해(조건을 전부 충족하는 배정안)를 찾으면 improve_seconds 초 뒤에 계산을 멈추는 timer 를 겁니다.

    solver 는 해를 찾을 때마다 on_solution_callback 을 부릅니다. 첫 호출에서만 timer 를 걸고, timer 는 별도 thread 에서
    stop_search 를 불러 계산을 중단합니다(stop_search 는 다른 thread 에서 불러도 됩니다). daemon=True 는 프로세스가
    끝날 때 이 thread 가 남아 있어도 종료를 막지 않게 합니다.
    """

    def __init__(self, solver: cp_model.CpSolver, improve_seconds: float) -> None:
        super().__init__()
        self._solver = solver
        self._improve_seconds = improve_seconds
        self._timer: threading.Timer | None = None

    def on_solution_callback(self) -> None:
        if self._timer is None:
            # stop_search 를 괄호 없이 넘깁니다. timer 가 만료될 때 부를 함수 자체를 전달하는 것입니다.
            self._timer = threading.Timer(self._improve_seconds, self._solver.stop_search)
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
    feasible: bool
    sessions_by_team: dict[int, list[RoomInterval]]
    open_slots: list[RoomInterval]


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
                f"{room.id}번 합주실의 운영 시간이 잘못되었습니다: {error}"
            ) from error
        for interval in intervals:
            room_slot = RoomInterval(room_id=room.id, interval=interval)
            if room_slot in seen:
                raise ValueError(
                    f"{room.id}번 합주실의 운영 시간이 겹칩니다: "
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


def _validate(teams: list[Team], sessions_per_team: int) -> None:
    """번호는 대상을 유일하게 식별해야 합니다. 중복되면 결과에서 대상을 구분할 수 없기 때문입니다."""
    if sessions_per_team < 0:
        raise ValueError("팀당 배정 개수는 음수일 수 없습니다")

    team_counts = Counter(team.id for team in teams)
    duplicated_teams = {team_id for team_id, count in team_counts.items() if count > 1}
    if duplicated_teams:
        raise ValueError(
            f"팀 번호가 겹칩니다: {', '.join(str(i) for i in sorted(duplicated_teams))}"
        )

    for team in teams:
        if not team.members:
            raise ValueError(f"{team.id}번 팀에 멤버가 없습니다")
        member_counts = Counter(member.id for member in team.members)
        duplicated_members = {
            member_id for member_id, count in member_counts.items() if count > 1
        }
        if duplicated_members:
            raise ValueError(
                f"{team.id}번 팀 명단에 같은 사람이 두 번 있습니다: "
                f"{', '.join(str(i) for i in sorted(duplicated_members))}"
            )


def assign(
    teams: list[Team],
    rooms: list[Room],
    sessions_per_team: int,
    slot_minutes: int,
    session_minutes: int,
    solver_time_limit_seconds: float,
    improve_seconds_after_first: float,
    daily_max_minutes: int | None = None,
) -> Assignment:
    """각 팀에게, 그 팀이 사용 가능한 시간의 빈 합주실 session 을 sessions_per_team 회 배정합니다.

    solver_time_limit_seconds 는 계산 1회의 상한이고, improve_seconds_after_first 는 첫 배정안을 찾은 뒤 연속 배정을
    더 늘리는 데 쓰는 시간입니다. 두 값 모두 pipeline.py 가 전달합니다.

    session 은 session_minutes 동안 끊기지 않고 이어지는 구간 하나입니다. slot_minutes 는 칸 하나의
    크기(분)이고 session 이 시작할 수 있는 간격입니다. 두 값 모두 저장소 설정이 결정합니다.

    칸 하나에는 팀 하나만 배정됩니다. 팀 하나는 같은 시간에 여러 합주실을 동시에 사용할 수 없으며,
    여러 팀에 속한 멤버도 같은 시간에 한 곳에만 있을 수 있습니다. 조건을 모두 충족하는 배정안이
    없을 경우 feasible=False 를 반환합니다.

    open_slots 는 어떤 session 도 차지하지 않은 칸입니다. session 이 아니라 칸 단위입니다 —
    남은 시간이 session 1회보다 짧아도 선착순 예약은 그 칸을 쓸 수 있기 때문입니다.
    """
    _validate(teams, sessions_per_team)
    room_slots = _build_room_slots(rooms, slot_minutes)
    room_sessions = _build_room_sessions(rooms, slot_minutes, session_minutes)
    covered = _covered_slots(room_sessions, slot_minutes)

    model = cp_model.CpModel()
    chosen = _session_vars(model, teams, room_sessions, sessions_per_team)
    indices_by_slot = _indices_by_slot(covered)
    indices_by_interval = _indices_by_interval(indices_by_slot)
    _one_team_per_slot(model, chosen, teams, indices_by_slot)
    _one_room_per_team(model, chosen, teams, indices_by_interval)
    _one_place_per_member(model, chosen, teams, indices_by_interval)
    if daily_max_minutes is not None:
        _limit_per_day(model, chosen, room_sessions, daily_max_minutes // session_minutes)
    _prefer_back_to_back(model, chosen, room_sessions)

    solved, solver = _solve(model, solver_time_limit_seconds, improve_seconds_after_first)
    if not solved:
        return Assignment(feasible=False, sessions_by_team={}, open_slots=[])

    sessions_by_team: dict[int, list[RoomInterval]] = {}
    taken: set[RoomInterval] = set()
    for team in teams:
        picked = _picked_indices(solver, chosen, team.id)
        for index in picked:
            taken.update(covered[index])
        sessions_by_team[team.id] = [room_sessions[index] for index in picked]

    open_slots = [room_slot for room_slot in room_slots if room_slot not in taken]
    return Assignment(
        feasible=True, sessions_by_team=sessions_by_team, open_slots=open_slots
    )


# (팀 번호, session 후보 번호) → 그 팀이 그 후보를 쓰면 1, 아니면 0 인 model 변수입니다.
Chosen = dict[tuple[int, int], cp_model.IntVar]


def _session_vars(
    model: cp_model.CpModel, teams: list[Team], room_sessions: list[RoomInterval], sessions_per_team: int
) -> Chosen:
    """팀마다 사용 가능한 session 후보에 변수를 만들고, 팀당 선택 수가 sessions_per_team 과 같다는 제약을 겁니다.

    팀이 쓸 수 없는 session 에는 변수를 만들지 않습니다. 변수를 만든 뒤 0 으로 고정하는 것보다
    model 의 변수·제약 수가 줄어 solve 시간이 짧아집니다. 팀이 쓸 수 있는 후보가 sessions_per_team 개보다
    적으면 제약을 충족할 수 없어 solve 가 해 없음을 반환합니다.
    """
    chosen: Chosen = {}
    for team in teams:
        own: list[cp_model.IntVar] = []
        for index, room_session in enumerate(room_sessions):
            if not is_team_available(team, room_session.interval):
                continue
            var = model.new_bool_var(f"chosen_{team.id}_{index}")
            chosen[(team.id, index)] = var
            own.append(var)
        model.add(cp_model.LinearExpr.sum(own) == sessions_per_team)
    return chosen


def _indices_by_slot(covered: dict[int, list[RoomInterval]]) -> dict[RoomInterval, list[int]]:
    """slot(칸)마다 그 칸을 차지하는 session 후보 번호 목록을 반환합니다. 후보끼리 겹치므로 칸 하나에 후보가 여럿입니다."""
    indices_by_slot: dict[RoomInterval, list[int]] = defaultdict(list)
    for index, room_slots_of_session in covered.items():
        for room_slot in room_slots_of_session:
            indices_by_slot[room_slot].append(index)
    return indices_by_slot


def _indices_by_interval(indices_by_slot: dict[RoomInterval, list[int]]) -> dict[TimeInterval, list[int]]:
    """합주실 번호를 뺀 시간 구간마다 후보 번호 목록을 반환합니다. 합주실이 달라도 같은 시각을 한 묶음으로 봅니다."""
    indices_by_interval: dict[TimeInterval, list[int]] = defaultdict(list)
    for room_slot, indices in indices_by_slot.items():
        indices_by_interval[room_slot.interval].extend(indices)
    return indices_by_interval


def _vars_of(chosen: Chosen, team_ids: list[int], indices: list[int]) -> list[cp_model.IntVar]:
    """team_ids 의 팀과 indices 의 후보 조합 중 변수가 있는 것만 모아 반환합니다. 변수가 없는 조합은 그 팀이 쓸 수 없는 후보입니다."""
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
    """팀 하나는 같은 시각에 합주실 한 곳만 씁니다."""
    for indices in indices_by_interval.values():
        for team in teams:
            _at_most_one(model, _vars_of(chosen, [team.id], indices))


def _one_place_per_member(
    model: cp_model.CpModel, chosen: Chosen, teams: list[Team], indices_by_interval: dict[TimeInterval, list[int]]
) -> None:
    """여러 팀에 속한 멤버는 같은 시각에 한 팀에만 있습니다. 팀이 하나뿐인 멤버는 제약이 필요 없습니다."""
    teams_by_member: dict[int, list[int]] = defaultdict(list)
    for team in teams:
        for member in team.members:
            teams_by_member[member.id].append(team.id)
    for team_ids in teams_by_member.values():
        if len(team_ids) < 2:
            continue
        for indices in indices_by_interval.values():
            _at_most_one(model, _vars_of(chosen, team_ids, indices))


def _solve(
    model: cp_model.CpModel, solver_time_limit_seconds: float, improve_seconds_after_first: float
) -> tuple[bool, cp_model.CpSolver]:
    """model 을 풉니다. 해를 찾았으면 (True, solver), 시간 안에 못 찾았거나 해가 없으면 (False, solver) 를 반환합니다.

    두 경우를 구분하지 않습니다 — 부르는 쪽은 배정안이 없다는 사실만 씁니다.
    """
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = solver_time_limit_seconds
    stopper = _StopAfterFirst(solver, improve_seconds_after_first)
    # 계산 중 오류가 나도 timer 를 취소합니다. 남겨 두면 끝난 계산에 timer 만료 시 stop_search 를 부릅니다.
    try:
        status = solver.solve(model, stopper)
    finally:
        stopper.cancel()
    return status in (cp_model.OPTIMAL, cp_model.FEASIBLE), solver


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


def _prefer_back_to_back(
    model: cp_model.CpModel,
    chosen: Chosen,
    room_sessions: list[RoomInterval],
) -> None:
    """같은 팀이 같은 합주실에서 바로 이어 쓰는 session 쌍의 수를 최대화하는 목적을 model 에 둡니다.

    합주실을 옮겨 가며 이어지는 쌍은 세지 않습니다. 하루에 몰리는 것은 _limit_per_day 가 막습니다.
    model 의 목적은 하나뿐이므로 maximize 는 여기서만 부릅니다. 시간 상한에 걸려 멈추면 그때까지 찾은
    가장 좋은 해가 결과입니다.
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
    if joined:
        model.maximize(cp_model.LinearExpr.sum(joined))


def _at_most_one(model: cp_model.CpModel, variables: list[cp_model.IntVar]) -> None:
    # 변수가 1개 이하이면 "합이 1 이하" 제약은 항상 충족되므로 추가하지 않습니다.
    if len(variables) >= 2:
        model.add(sum(variables) <= 1)
