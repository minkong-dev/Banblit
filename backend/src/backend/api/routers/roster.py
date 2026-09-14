from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.api.permission_service import account_permissions
from backend.api.roster_service import assign_slot as assign_slot_row
from backend.api.roster_service import clear_slot as clear_slot_row
from backend.api.roster_service import create_team as create_team_row
from backend.api.roster_service import delete_team as delete_team_row
from backend.api.roster_service import replace_slots as replace_slots_rows
from backend.api.roster_service import (
    list_members,
    list_slots,
    list_teams,
    search_members,
)
from backend.api.roster_service import update_team as update_team_row
from backend.api.schemas import (
    MemberOut,
    MemberRowOut,
    MemberRowsOut,
    MembersOut,
    MemberSearchOut,
    SlotAssignIn,
    SlotEnvelopeOut,
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
        id=team.id, name=team.name, slot_count=slot_count, filled_count=filled_count
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
# 매개변수를 남기지 않도록 dependencies에 건다.
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
    """포지션에 속한 사람만 반환합니다. 빈 포지션도 함께 보려면 slots endpoint(API의 요청 주소 단위)를 사용합니다 —
    캘린더의 "이날 참석자"는 사람만 필요하므로 이 endpoint를 그대로 둡니다."""
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
    """모든 사람을 학번순으로 반환합니다. 화면이 아래로 스크롤하면서 이어서 받습니다."""
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
    """포지션에 배정할 사람을 이름으로 검색합니다. 빈 검색어에는 결과를 반환하지 않습니다 —
    전체 명단을 공개하는 endpoint가 되면 안 되기 때문입니다."""
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
    team = create_team_row(session, req.name, req.slots)
    # 방금 생성된 포지션은 전부 비어 있습니다 — 계산할 것 없이 배정된 사람은 0입니다.
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
    team = update_team_row(session, team_id, req.name)
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
    """포지션에 사람을 배정합니다. 팀 구성은 팀을 다루는 권한 항목이 구분합니다."""
    slot = assign_slot_row(session, team_id, slot_id, req.member_id)
    return SlotEnvelopeOut(slot=_slot_out(slot, session.get(Member, req.member_id)))


@router.delete("/teams/{team_id}/slots/{slot_id}", status_code=204)
def delete_slot_member(
    team_id: int,
    slot_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    """포지션을 비웁니다. 포지션 자체는 남습니다.

    이 endpoint는 항목 전체로 막지 않습니다 — 사용자가 스스로 빠지는 것은 권한 항목이 없어도
    되기 때문입니다. 그래서 로그인만 검증한 후 안에서 본인 여부를 함께 확인합니다.
    """
    slot = session.get(TeamSlot, slot_id)
    if slot is None or slot.team_id != team_id:
        raise HTTPException(status_code=422, detail="그런 포지션가 없습니다")

    mine = slot.member_id == requester.id
    if not mine and "member_remove" not in account_permissions(session, requester.id):
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    clear_slot_row(session, team_id, slot_id)
