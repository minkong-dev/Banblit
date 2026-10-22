# roster 모듈의 시퀀스 파일이자 공개 interface(다른 모듈에서 접근하는 진입점)입니다.
# api 와 다른 service 모듈은 이 모듈 안의 다른 파일을 직접 import 하지 않고 이 파일만 참조합니다.
# 팀당 포지션 수, 사진 용량, 검색 결과 수처럼 운영자가 조절하는 값은 이 파일에만 둡니다.

from typing import BinaryIO

from sqlalchemy.orm import Session

from backend.db.models import Member, Team, TeamSlot
from backend.services.permission.pipeline import account_permissions
from backend.services.roster import avatar_service, roster_service
from backend.services.roster.avatar_service import avatar_path, delete_avatar
from backend.services.roster.roster_service import (
    ROSTER_MESSAGES,
    assign_slot,
    delete_team,
    expel_member,
    get_team_or_raise,
    list_members,
    list_my_teams,
    list_slots,
    list_teams,
    require_team_member,
    team_slot_counts,
    update_team,
)

# 한 팀의 포지션 수 상한입니다. 근거 없는 임의값입니다(사용자 결정 2026-10-12). 배정 계산에는 팀원 수 상한이 없습니다.
MAX_SLOTS_PER_TEAM = 10
# 프로필 사진 1장의 크기 상한입니다. 휴대폰으로 찍은 사진 1장이 보통 3~5MB 입니다.
MAX_AVATAR_BYTES = 5 * 1024 * 1024
# 멤버 검색 1회의 결과 수 상한입니다. 빈 검색어에는 명단 전체를 반환하므로 명단이 이보다 크면 잘립니다.
SEARCH_LIMIT = 200


def create_team(session: Session, name: str, counts: dict[str, int], color: str | None = None) -> Team:
    return roster_service.create_team(session, name, counts, MAX_SLOTS_PER_TEAM, color)


def replace_slots(session: Session, team_id: int, counts: dict[str, int]) -> None:
    roster_service.replace_slots(session, team_id, counts, MAX_SLOTS_PER_TEAM)


def save_avatar(session: Session, member: Member, filename: str, stream: BinaryIO) -> None:
    avatar_service.save_avatar(session, member, filename, stream, MAX_AVATAR_BYTES)


def search_members(session: Session, query: str) -> list[Member]:
    return roster_service.search_members(session, query, SEARCH_LIMIT)


def assign_slot_members(
    session: Session, team_id: int, wanted: list[tuple[int, int | None]], requester: Member
) -> None:
    """자리 2개 이상의 배정을 transaction 1개로 저장합니다. 자리에 배치하려면 member_add, 다른 사람의 배치를 해제하려면 member_remove 가 필요합니다."""
    # 항목마다 필요한 권한이 달라 endpoint 의 dependency 가 아니라 이 함수에서 요청자의 권한을 조회해 전달합니다.
    held = account_permissions(session, requester.id)
    roster_service.assign_slot_members(
        session, team_id, wanted, "member_add" in held, "member_remove" in held, requester.id
    )


def clear_slot(session: Session, team_id: int, slot_id: int, requester: Member) -> TeamSlot:
    """포지션의 배정을 해제합니다. 자신의 자리는 권한 없이, 다른 사람의 자리는 member_remove 로 해제합니다."""
    # 본인 자리 해제는 권한이 필요 없어 endpoint 의 dependency 로 막지 않고 이 함수에서 권한을 조회해 전달합니다.
    may_unseat = "member_remove" in account_permissions(session, requester.id)
    return roster_service.clear_slot(session, team_id, slot_id, requester.id, may_unseat)


__all__ = [
    "MAX_AVATAR_BYTES",
    "MAX_SLOTS_PER_TEAM",
    "SEARCH_LIMIT",
    "ROSTER_MESSAGES",
    "assign_slot",
    "assign_slot_members",
    "avatar_path",
    "clear_slot",
    "create_team",
    "delete_avatar",
    "delete_team",
    "expel_member",
    "get_team_or_raise",
    "list_members",
    "list_my_teams",
    "list_slots",
    "list_teams",
    "replace_slots",
    "require_team_member",
    "save_avatar",
    "search_members",
    "team_slot_counts",
    "update_team",
]
