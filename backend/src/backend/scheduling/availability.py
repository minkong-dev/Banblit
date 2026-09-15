from dataclasses import dataclass

from backend.scheduling.interval import TimeInterval


@dataclass
class Member:
    """사용자 한 명입니다. 이름이 아니라 ID로 구분합니다. 동명이인이 있기 때문입니다."""

    id: int
    unavailable: list[TimeInterval]


@dataclass
class Team:
    """팀 하나입니다. 이름은 엔진 밖에서만 사용되므로 여기에는 포함하지 않습니다."""

    id: int
    members: list[Member]


def is_member_available(member: Member, slot: TimeInterval) -> bool:
    """slot(1시간 단위 시간 칸)이 사용자의 사용 불가능 시간 중 어느 하나와도 겹치지
    않을 경우 True를 반환합니다.
    """
    for interval in member.unavailable:
        overlaps = slot.start < interval.end and interval.start < slot.end
        if overlaps:
            return False
    return True


def is_team_available(team: Team, slot: TimeInterval) -> bool:
    """팀의 모든 멤버가 그 slot(1시간 단위 시간 칸)에 사용 가능할 경우 True를 반환합니다."""
    return all(is_member_available(member, slot) for member in team.members)
