import threading
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime

from ortools.sat.python import cp_model

from backend.scheduling.availability import Team, is_team_available
from backend.scheduling.interval import TimeInterval
from backend.scheduling.slots import generate_sessions, generate_slots


# 첫 배정을 찾은 뒤 연속 배정을 더 늘리는 데 쓰는 시간(초)입니다(2026-09-28 사용자 결정). 연속 배정이 최대인지는
# 끝까지 증명하지 못해, 멈추지 않으면 상한(solver_time_limit_seconds)을 매번 다 씁니다. 12팀·40명 규모에서 3초면
# 12팀 중 11팀이 한 덩어리였고, 60초면 12팀 전부였습니다. 배정 가능 여부를 찾는 시간은 이 값과 관계없이 상한까지 씁니다.
IMPROVE_SECONDS_AFTER_FIRST = 3.0


class _StopAfterFirst(cp_model.CpSolverSolutionCallback):
    """첫 해를 찾으면 IMPROVE_SECONDS_AFTER_FIRST 초 뒤에 계산을 멈추는 timer 를 겁니다."""

    def __init__(self, solver: cp_model.CpSolver) -> None:
        super().__init__()
        self._solver = solver
        self._timer: threading.Timer | None = None

    def on_solution_callback(self) -> None:
        if self._timer is None:
            self._timer = threading.Timer(IMPROVE_SECONDS_AFTER_FIRST, self._solver.stop_search)
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
    daily_max_minutes: int | None = None,
) -> Assignment:
    """각 팀에게, 그 팀이 사용 가능한 시간의 빈 합주실 session 을 sessions_per_team 회 배정합니다.

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

    # 팀이 쓸 수 없는 session 에는 변수를 만들지 않습니다. 변수를 만든 뒤 0 으로 고정하는 것보다
    # model 의 변수·제약 수가 줄어 solve 시간이 짧아집니다.
    chosen: dict[tuple[int, int], cp_model.IntVar] = {}
    for team in teams:
        own: list[cp_model.IntVar] = []
        for index, room_session in enumerate(room_sessions):
            if not is_team_available(team, room_session.interval):
                continue
            var = model.new_bool_var(f"chosen_{team.id}_{index}")
            chosen[(team.id, index)] = var
            own.append(var)
        model.add(cp_model.LinearExpr.sum(own) == sessions_per_team)

    # 칸 하나를 차지하는 session 후보 번호를 모읍니다. 후보끼리 겹치므로 칸 하나에 후보가 여럿입니다.
    indices_by_slot: dict[RoomInterval, list[int]] = defaultdict(list)
    for index, room_slots_of_session in covered.items():
        for room_slot in room_slots_of_session:
            indices_by_slot[room_slot].append(index)

    for indices in indices_by_slot.values():
        in_slot: list[cp_model.IntVar] = []
        for team in teams:
            for index in indices:
                if (team.id, index) in chosen:
                    in_slot.append(chosen[(team.id, index)])
        _at_most_one(model, in_slot)

    # 합주실이 달라도 같은 시각이면 한 팀은 한 곳에만 있을 수 있습니다. 합주실 번호를 뺀
    # 시간 구간으로 다시 모읍니다.
    indices_by_interval: dict[TimeInterval, list[int]] = defaultdict(list)
    for room_slot, indices in indices_by_slot.items():
        indices_by_interval[room_slot.interval].extend(indices)

    for indices in indices_by_interval.values():
        for team in teams:
            own_here: list[cp_model.IntVar] = []
            for index in indices:
                if (team.id, index) in chosen:
                    own_here.append(chosen[(team.id, index)])
            _at_most_one(model, own_here)

    teams_by_member: dict[int, list[int]] = defaultdict(list)
    for team in teams:
        for member in team.members:
            teams_by_member[member.id].append(team.id)
    for team_ids in teams_by_member.values():
        if len(team_ids) < 2:
            continue
        for indices in indices_by_interval.values():
            shared: list[cp_model.IntVar] = []
            for team_id in team_ids:
                for index in indices:
                    if (team_id, index) in chosen:
                        shared.append(chosen[(team_id, index)])
            _at_most_one(model, shared)

    if daily_max_minutes is not None:
        _limit_per_day(model, chosen, room_sessions, daily_max_minutes // session_minutes)
    _prefer_back_to_back(model, chosen, room_sessions)

    solver = cp_model.CpSolver()
    # solver_time_limit_seconds 를 넘기면 계산을 중단합니다. 그때까지 배정안을 찾지 못했으면
    # feasible=False 로 처리합니다.
    solver.parameters.max_time_in_seconds = solver_time_limit_seconds
    stopper = _StopAfterFirst(solver)
    # 계산 중 오류가 나도 timer 를 취소합니다. 남겨 두면 끝난 계산에 3초 뒤 stop_search 를 부릅니다.
    try:
        status = solver.solve(model, stopper)
    finally:
        stopper.cancel()
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Assignment(feasible=False, sessions_by_team={}, open_slots=[])

    sessions_by_team: dict[int, list[RoomInterval]] = {}
    taken: set[RoomInterval] = set()
    for team in teams:
        picked = [
            index
            for index, _ in enumerate(room_sessions)
            if (team.id, index) in chosen and solver.value(chosen[(team.id, index)]) == 1
        ]
        for index in picked:
            taken.update(covered[index])
        sessions_by_team[team.id] = [room_sessions[index] for index in picked]

    open_slots = [room_slot for room_slot in room_slots if room_slot not in taken]
    return Assignment(
        feasible=True, sessions_by_team=sessions_by_team, open_slots=open_slots
    )


def _limit_per_day(
    model: cp_model.CpModel,
    chosen: dict[tuple[int, int], cp_model.IntVar],
    room_sessions: list[RoomInterval],
    most: int,
) -> None:
    """팀마다 하루에 배정되는 session 수를 most 이하로 묶습니다(2026-09-28 사용자 결정).

    연속 배정을 최대화하면 이 제약이 없을 때 팀의 시간이 하루에 전부 몰립니다. 날짜는 session 시작일입니다.
    """
    by_day: dict[tuple[int, date], list[cp_model.IntVar]] = defaultdict(list)
    for (team_id, index), var in chosen.items():
        by_day[(team_id, room_sessions[index].interval.start.date())].append(var)
    for variables in by_day.values():
        if len(variables) > most:
            model.add(cp_model.LinearExpr.sum(variables) <= most)


def _prefer_back_to_back(
    model: cp_model.CpModel,
    chosen: dict[tuple[int, int], cp_model.IntVar],
    room_sessions: list[RoomInterval],
) -> None:
    """같은 팀이 같은 합주실에서 바로 이어 쓰는 session 쌍의 수를 최대화합니다(2026-09-28 사용자 결정).

    제약만 두면 조건을 충족하는 해 중 아무것이나 나와, 불가능 시간이 없어도 팀의 시간이 흩어지고
    실행할 때마다 배치가 달라집니다. 날짜별 한도는 두지 않습니다 — 불가능 시간만 피하고 나머지는 붙입니다.
    합주실을 옮겨 가며 이어지는 쌍은 세지 않습니다.
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
