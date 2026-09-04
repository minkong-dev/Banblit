from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel

from backend.api.schemas import (
    AssignmentOut,
    AssignRequest,
    IntervalIn,
    MemberIn,
    ProposalOut,
    ResolutionOut,
    RoomSlotOut,
    TeamIn,
)
from backend.scheduling.pipeline import (
    Assignment,
    Member,
    Resolution,
    Room,
    RoomSlot,
    Team,
    TimeInterval,
    generate_slots,
)


@dataclass(frozen=True)
class EngineNames:
    """엔진이 쓴 번호를 요청에 적힌 이름으로 되돌린다.

    엔진은 팀·합주실·사람을 번호로만 다룬다. 이 창구는 저장소를 거치지 않아
    진짜 번호가 없으므로, 요청에 나온 순서를 번호로 삼는다 — 목록의 자리번호가
    곧 그 대상의 번호다.
    """

    teams: list[str]
    rooms: list[str]
    members: list[str]


def _to_interval(value: IntervalIn) -> TimeInterval:
    # value 의 start·end 를 엔진의 TimeInterval 로 옮긴다. 시간대가 붙었거나
    # 끝이 시작보다 앞이면 TimeInterval 이 여기서 ValueError 로 거부한다.
    return TimeInterval(start=value.start, end=value.end)


def _to_member(member: MemberIn, member_id: int) -> Member:
    # member 의 불가능 시간을 하나씩 TimeInterval 로 바꿔 엔진의 Member 를 만든다.
    unavailable = [_to_interval(interval) for interval in member.unavailable]
    return Member(id=member_id, unavailable=unavailable)


def _to_team(team: TeamIn, team_id: int, member_ids: dict[str, int]) -> Team:
    # team 의 멤버를 하나씩 _to_member 에 넣어 엔진의 Team 을 만든다.
    # 번호는 member_ids 에서 이름으로 찾는다 — 같은 이름이면 같은 번호이므로,
    # 두 팀에 걸친 사람이 엔진에서 한 사람으로 다뤄진다.
    members = [_to_member(member, member_ids[member.name]) for member in team.members]
    return Team(id=team_id, members=members)


def _number_members(teams: list[TeamIn]) -> tuple[dict[str, int], list[str]]:
    # 요청에 나온 모든 사람 이름에 처음 나온 순서대로 번호를 매긴다.
    # 이름→번호와 번호→이름을 함께 돌려준다.
    member_ids: dict[str, int] = {}
    names: list[str] = []
    for team in teams:
        for member in team.members:
            if member.name not in member_ids:
                member_ids[member.name] = len(names)
                names.append(member.name)
    return member_ids, names


def request_to_engine(
    req: AssignRequest,
) -> tuple[list[Team], list[Room], int, EngineNames]:
    _reject_duplicate_names(req)

    member_ids, member_names = _number_members(req.teams)
    teams = [
        _to_team(team, team_id, member_ids) for team_id, team in enumerate(req.teams)
    ]
    rooms = [
        Room(id=room_id, open_period=_to_interval(room.open_period))
        for room_id, room in enumerate(req.rooms)
    ]

    names = EngineNames(
        teams=[team.name for team in req.teams],
        rooms=[room.name for room in req.rooms],
        members=member_names,
    )
    _reject_if_over_capacity(teams, rooms, names, req.slots_per_team)
    return teams, rooms, req.slots_per_team, names


def _duplicated(names: list[str]) -> set[str]:
    return {name for name in names if names.count(name) > 1}


def _reject_duplicate_names(req: AssignRequest) -> None:
    # 답장은 팀 이름으로 배정 결과를 묶고 합주실 이름으로 자리를 가리킨다.
    # 이름이 겹치면 한쪽 결과가 다른 쪽을 덮어써 조용히 사라진다.
    duplicated_rooms = _duplicated([room.name for room in req.rooms])
    if duplicated_rooms:
        raise ValueError(f"합주실 이름이 겹칩니다: {', '.join(sorted(duplicated_rooms))}")

    duplicated_teams = _duplicated([team.name for team in req.teams])
    if duplicated_teams:
        raise ValueError(f"팀 이름이 겹칩니다: {', '.join(sorted(duplicated_teams))}")


def _reject_if_over_capacity(
    teams: list[Team], rooms: list[Room], names: EngineNames, slots_per_team: int
) -> None:
    # rooms 의 운영시간을 generate_slots 로 칸으로 쪼개 전체 칸 수를 센 뒤,
    # 팀 수 × 팀당 칸 수가 그보다 많으면 ValueError 로 거부한다.
    # 운영시간 자체가 잘못됐으면 요청에 적힌 방 이름을 붙여 여기서 거부한다 —
    # 엔진이 붙이는 번호는 요청 안의 자리번호일 뿐이라 부르는 쪽에 뜻이 없다.
    total_slots = 0
    for room in rooms:
        try:
            total_slots += len(generate_slots(room.open_period))
        except ValueError as error:
            raise ValueError(
                f"'{names.rooms[room.id]}' 방의 운영 시간이 잘못되었습니다: {error}"
            ) from error

    needed = slots_per_team * len(teams)
    if needed > total_slots:
        raise ValueError(
            f"요청한 자리 개수(팀 {len(teams)}개 × {slots_per_team}칸 = {needed})가 "
            f"운영시간의 전체 칸 수({total_slots})를 넘습니다"
        )


def assignment_out(
    assignment: Assignment,
    to_slot: Callable[[RoomSlot], BaseModel],
    to_team_name: Callable[[int], str],
) -> AssignmentOut:
    # assignment 의 칸들을 to_slot 에 하나씩 넣어 응답용 배정 한 벌을 만들고,
    # 팀 번호는 to_team_name 으로 이름으로 바꿔 묶음의 열쇠로 쓴다.
    # 기간 배정은 이 두 함수만 바꿔 이 함수를 그대로 쓴다.
    slots_by_team: dict[str, list[BaseModel]] = {}
    for team_id, slots in assignment.slots_by_team.items():
        slots_by_team[to_team_name(team_id)] = [
            to_slot(room_slot) for room_slot in slots
        ]

    return AssignmentOut(
        feasible=assignment.feasible,
        slots_by_team=slots_by_team,
        open_slots=[to_slot(room_slot) for room_slot in assignment.open_slots],
    )


def resolution_to_out(res: Resolution, names: EngineNames) -> ResolutionOut:
    def to_slot(room_slot: RoomSlot) -> RoomSlotOut:
        return RoomSlotOut(
            room=names.rooms[room_slot.room_id],
            start=room_slot.interval.start,
            end=room_slot.interval.end,
        )

    def to_team_name(team_id: int) -> str:
        return names.teams[team_id]

    proposals: list[ProposalOut] = []
    for proposal in res.proposals:
        proposals.append(
            ProposalOut(
                excluded_member=names.members[proposal.excluded_member],
                assignment=assignment_out(proposal.assignment, to_slot, to_team_name),
            )
        )

    return ResolutionOut(
        assignment=assignment_out(res.assignment, to_slot, to_team_name),
        proposals=proposals,
    )
