from dataclasses import dataclass

from backend.scheduling.interval import TimeInterval


@dataclass
class Member:
    """사람 한 명. 이름이 아니라 번호로 구분한다 — 동명이인이 있다."""

    id: int
    unavailable: list[TimeInterval]


@dataclass
class Team:
    """팀 하나. 이름은 엔진 밖에서만 쓰므로 여기에는 두지 않는다."""

    id: int
    members: list[Member]


def is_member_available(member: Member, slot: TimeInterval) -> bool:
    """슬롯이 멤버의 불가능 시간 어느 하나와도 겹치지 않으면 가능."""
    for interval in member.unavailable:
        overlaps = slot.start < interval.end and interval.start < slot.end
        if overlaps:
            return False
    return True


def is_team_available(team: Team, slot: TimeInterval) -> bool:
    """팀의 모든 멤버가 그 슬롯에 가능할 때만 팀이 가능하다."""
    return all(is_member_available(member, slot) for member in team.members)
