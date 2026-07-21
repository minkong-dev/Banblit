from backend.api.schemas import (
    AssignmentOut,
    AssignRequest,
    IntervalIn,
    ProposalOut,
    ResolutionOut,
    RoomSlotOut,
)
from backend.scheduling.assignment import Assignment, Room, RoomSlot
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval
from backend.scheduling.resolution import Resolution
from backend.scheduling.slots import generate_slots


def _to_interval(value: IntervalIn) -> TimeInterval:
    # TimeInterval 이 시간대·역전 구간을 스스로 거부한다(엔진 계약 재사용).
    return TimeInterval(start=value.start, end=value.end)


def request_to_engine(req: AssignRequest) -> tuple[list[Team], list[Room], int]:
    teams = [
        Team(
            name=team.name,
            members=[
                Member(
                    name=member.name,
                    unavailable=[_to_interval(u) for u in member.unavailable],
                )
                for member in team.members
            ],
        )
        for team in req.teams
    ]
    rooms = [
        Room(name=room.name, open_period=_to_interval(room.open_period))
        for room in req.rooms
    ]
    _reject_if_over_capacity(teams, rooms, req.slots_per_team)
    return teams, rooms, req.slots_per_team


def _reject_if_over_capacity(
    teams: list[Team], rooms: list[Room], slots_per_team: int
) -> None:
    # 방 운영시간이 잘못된 경우(오프그리드 등)의 에러 메시지는 엔진이 방 이름을 붙여
    # 내는 기존 동작을 그대로 유지해야 한다. 그래서 여기서는 칸 수를 세다가
    # ValueError 가 나면 이 검사를 조용히 건너뛰고, 엔진의 기존 검증에 맡긴다.
    try:
        total_slots = sum(len(generate_slots(room.open_period)) for room in rooms)
    except ValueError:
        return

    needed = slots_per_team * len(teams)
    if needed > total_slots:
        raise ValueError(
            f"요청한 자리 개수(팀 {len(teams)}개 × {slots_per_team}칸 = {needed})가 "
            f"운영시간의 전체 칸 수({total_slots})를 넘습니다"
        )


def _room_slot_out(room_slot: RoomSlot) -> RoomSlotOut:
    return RoomSlotOut(
        room=room_slot.room,
        start=room_slot.interval.start,
        end=room_slot.interval.end,
    )


def _assignment_out(assignment: Assignment) -> AssignmentOut:
    return AssignmentOut(
        feasible=assignment.feasible,
        slots_by_team={
            team_name: [_room_slot_out(rs) for rs in slots]
            for team_name, slots in assignment.slots_by_team.items()
        },
        open_slots=[_room_slot_out(rs) for rs in assignment.open_slots],
    )


def resolution_to_out(res: Resolution) -> ResolutionOut:
    return ResolutionOut(
        assignment=_assignment_out(res.assignment),
        proposals=[
            ProposalOut(
                excluded_member=proposal.excluded_member,
                assignment=_assignment_out(proposal.assignment),
            )
            for proposal in res.proposals
        ],
    )
