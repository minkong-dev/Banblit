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
    """slot(점유 단위 길이의 시간 칸)이 사용자의 불가능 일정 중 어느 하나와도 겹치지 않을 경우 True 를 반환합니다."""
    for interval in member.unavailable:
        overlaps = slot.start < interval.end and interval.start < slot.end
        if overlaps:
            return False
    return True


def absent_member_ids(team: Team, interval: TimeInterval) -> list[int]:
    """interval 에 불가능 일정이 있어 참석하지 못하는 팀원의 번호를 명단 순서로 반환합니다."""
    return [member.id for member in team.members if not is_member_available(member, interval)]
