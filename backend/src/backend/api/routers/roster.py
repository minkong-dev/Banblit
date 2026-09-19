from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.services.permission_service import account_permissions
from backend.services.roster_service import assign_slot as assign_slot_row
from backend.services.roster_service import clear_slot as clear_slot_row
from backend.services.roster_service import create_team as create_team_row
from backend.services.roster_service import delete_team as delete_team_row
from backend.services.roster_service import expel_member as expel_member_row
from backend.services.roster_service import assign_slot_members as assign_slot_members_rows
from backend.services.roster_service import replace_slots as replace_slots_rows
from backend.services.roster_service import (
    list_members,
    list_slots,
    list_teams,
    search_members,
)
from backend.services.roster_service import update_team as update_team_row
from backend.api.schemas import (
    MemberOut,
    MemberRowOut,
    MemberRowsOut,
    MembersOut,
    MemberSearchOut,
    SlotAssignIn,
    SlotEnvelopeOut,
    SlotMembersIn,
    SlotOut,
    SlotsOut,
    TeamCreateIn,
    TeamSlotsIn,
    TeamEnvelopeOut,
    TeamOut,
    TeamsOut,
    TeamUpdateIn,
)
from backend.db.models import Member, Team, TeamSlot
from backend.db.pipeline import get_session

router = APIRouter()


def _team_out(team: Team, slot_count: int, filled_count: int) -> TeamOut:
    return TeamOut(
        id=team.id,
        name=team.name,
        color=team.color,
        slot_count=slot_count,
        filled_count=filled_count,
    )


def _member_out(member: Member) -> MemberOut:
    return MemberOut(
        id=member.id,
        name=member.name,
        department=member.department,
        student_no=member.student_no,
        cohort=member.cohort,
    )


def _slot_out(slot: TeamSlot, member: Member | None) -> SlotOut:
    return SlotOut(
        id=slot.id,
        team_id=slot.team_id,
        instrument=slot.instrument,
        ordinal=slot.ordinal,
        member_id=None if member is None else member.id,
        member_name=None if member is None else member.name,
        member_cohort=None if member is None else member.cohort,
    )


# 요청자의 신원을 사용하지 않고 로그인만 검증하는 endpoint(API의 요청 주소 단위)는, 사용하지 않는
# 매개변수를 남기지 않도록 dependencies 에 추가합니다.
@router.get("/teams", response_model=TeamsOut, dependencies=[Depends(require_account)])
def read_teams(session: Session = Depends(get_session)) -> TeamsOut:
    return TeamsOut(
        teams=[
            _team_out(team, slot_count, filled_count)
            for team, slot_count, filled_count in list_teams(session)
        ]
    )


@router.get(
    "/teams/{team_id}/slots",
    response_model=SlotsOut,
    dependencies=[Depends(require_account)],
)
def read_team_slots(
    team_id: int, session: Session = Depends(get_session)
) -> SlotsOut:
    rows = list_slots(session, team_id)
    return SlotsOut(slots=[_slot_out(slot, member) for slot, member in rows])


@router.get(
    "/teams/{team_id}/members",
    response_model=MembersOut,
    dependencies=[Depends(require_account)],
)
def read_team_members(
    team_id: int, session: Session = Depends(get_session)
) -> MembersOut:
    """포지션에 배정된 멤버만 반환합니다. 빈 포지션도 함께 보려면 slots endpoint(API의 요청 주소 단위)를 사용합니다.
    캘린더의 "이날 참석자"는 멤버만 필요하므로 이 endpoint 를 사용합니다."""
    rows = list_slots(session, team_id)
    return MembersOut(
        members=[_member_out(member) for _, member in rows if member is not None]
    )


@router.get(
    "/members", response_model=MemberRowsOut, dependencies=[Depends(require_account)]
)
def read_members(
    after: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
) -> MemberRowsOut:
    """모든 멤버를 멤버 번호(id) 오름차순으로 반환합니다. 화면이 아래로 스크롤하면서 after 이후를 이어서 받습니다."""
    return MemberRowsOut(
        members=[
            MemberRowOut(**_member_out(member).model_dump(), permission_sets=sets)
            for member, sets in list_members(session, after, limit)
        ]
    )


@router.get(
    "/members/search",
    response_model=MemberSearchOut,
    dependencies=[Depends(require_account)],
)
def search_member_list(
    q: str = Query(default="", max_length=100),
    session: Session = Depends(get_session),
) -> MemberSearchOut:
    """포지션에 배정할 멤버를 이름으로 검색합니다. 빈 검색어에는 결과를 반환하지 않습니다.
    전체 명단을 공개하는 endpoint 가 되면 안 되기 때문입니다."""
    return MemberSearchOut(
        members=[_member_out(member) for member in search_members(session, q)]
    )


@router.post(
    "/teams",
    response_model=TeamEnvelopeOut,
    status_code=201,
    dependencies=[Depends(require_permission("team_create"))],
)
def create_team(
    req: TeamCreateIn, session: Session = Depends(get_session)
) -> TeamEnvelopeOut:
    team = create_team_row(session, req.name, req.slots, req.color)
    # 방금 생성된 포지션은 전부 비어 있으므로, 조회하지 않고 배정된 멤버 수를 0 으로 반환합니다.
    slot_count = sum(count for count in req.slots.values() if count > 0)
    return TeamEnvelopeOut(team=_team_out(team, slot_count, 0))


@router.patch(
    "/teams/{team_id}",
    response_model=TeamEnvelopeOut,
    dependencies=[Depends(require_permission("team_edit"))],
)
def patch_team(
    team_id: int, req: TeamUpdateIn, session: Session = Depends(get_session)
) -> TeamEnvelopeOut:
    team = update_team_row(session, team_id, req.name, req.color)
    rows = list_slots(session, team_id)
    filled = sum(1 for _, member in rows if member is not None)
    return TeamEnvelopeOut(team=_team_out(team, len(rows), filled))


@router.delete(
    "/teams/{team_id}",
    status_code=204,
    dependencies=[Depends(require_permission("team_delete"))],
)
def delete_team_endpoint(team_id: int, session: Session = Depends(get_session)) -> None:
    delete_team_row(session, team_id)


@router.put(
    "/teams/{team_id}/slots",
    response_model=SlotsOut,
    dependencies=[Depends(require_permission("team_edit"))],
)
def put_team_slots(
    team_id: int, req: TeamSlotsIn, session: Session = Depends(get_session)
) -> SlotsOut:
    """포지션 구성을 통째로 재설정합니다. 포지션에 있던 사람은 그 포지션이 남으면 함께 유지됩니다."""
    replace_slots_rows(session, team_id, req.slots)
    rows = list_slots(session, team_id)
    return SlotsOut(slots=[_slot_out(slot, member) for slot, member in rows])


@router.put(
    "/teams/{team_id}/slots/{slot_id}",
    response_model=SlotEnvelopeOut,
    dependencies=[Depends(require_permission("member_add"))],
)
def put_slot_member(
    team_id: int,
    slot_id: int,
    req: SlotAssignIn,
    session: Session = Depends(get_session),
) -> SlotEnvelopeOut:
    """포지션에 멤버를 배정합니다. 포지션 구성 변경은 team_edit 권한, 멤버 배정은 member_add 권한으로 구분합니다."""
    slot = assign_slot_row(session, team_id, slot_id, req.member_id)
    return SlotEnvelopeOut(slot=_slot_out(slot, session.get(Member, req.member_id)))


@router.put("/teams/{team_id}/slot-members", response_model=SlotsOut)
def put_team_slot_members(
    team_id: int,
    req: SlotMembersIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> SlotsOut:
    """팀 화면의 저장 버튼 1번이 보내는 자리 배정 전체를 transaction 1개로 저장합니다.

    자리마다 PUT 과 DELETE 를 따로 보내면 중간 요청이 실패했을 때 앞선 요청만 반영된 상태로
    끝납니다. 이 endpoint 는 전부 반영하거나 아무것도 반영하지 않습니다.

    dependencies 에서 권한을 검증하지 않습니다. 배정에는 member_add, 다른 사람의 해제에는
    member_remove 가 필요하고 자신의 해제에는 아무 권한도 필요하지 않아, 항목마다 다르기
    때문입니다. 자리마다 보내는 endpoint 2개와 같은 규칙입니다.
    """
    held = account_permissions(session, requester.id)
    assign_slot_members_rows(
        session,
        team_id,
        [(entry.slot_id, entry.member_id) for entry in req.assignments],
        may_seat="member_add" in held,
        may_unseat="member_remove" in held,
        requester_id=requester.id,
    )
    rows = list_slots(session, team_id)
    return SlotsOut(slots=[_slot_out(slot, member) for slot, member in rows])


@router.delete("/teams/{team_id}/slots/{slot_id}", status_code=204)
def delete_slot_member(
    team_id: int,
    slot_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    """포지션의 멤버 배정을 해제합니다. 포지션 자체는 유지됩니다.

    이 endpoint 는 dependencies 에서 권한을 검증하지 않습니다. 사용자가 자신을 포지션에서 제외하는 것은
    member_remove 권한이 없어도 되기 때문입니다. 로그인만 검증한 뒤 함수 안에서 본인 여부와
    member_remove 권한을 확인합니다.
    """
    slot = session.get(TeamSlot, slot_id)
    if slot is None or slot.team_id != team_id:
        raise HTTPException(status_code=422, detail="해당하는 포지션이 없습니다")

    mine = slot.member_id == requester.id
    if not mine and "member_remove" not in account_permissions(session, requester.id):
        raise HTTPException(status_code=403, detail="관련된 권한을 가지고 있지 않습니다")

    clear_slot_row(session, team_id, slot_id)


@router.delete("/members/{member_id}", status_code=204)
def expel_member(
    member_id: int,
    requester: Member = Depends(require_permission("member_expel")),
    session: Session = Depends(get_session),
) -> None:
    """멤버를 추방합니다. 추방은 계정 삭제와 같습니다. 자기 자신은 추방할 수 없습니다."""
    expel_member_row(session, member_id, requester)
