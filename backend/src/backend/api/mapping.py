from backend.api.schemas import AssignRequest, IntervalIn
from backend.scheduling.assignment import Room
from backend.scheduling.availability import Member, Team
from backend.scheduling.interval import TimeInterval


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
    return teams, rooms, req.slots_per_team
