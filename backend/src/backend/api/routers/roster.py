from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.api.permission_service import account_permissions
from backend.api.roster_service import assign_slot as assign_slot_row
from backend.api.roster_service import clear_slot as clear_slot_row
from backend.api.roster_service import create_team as create_team_row
from backend.api.roster_service import list_slots, list_teams, search_members
from backend.api.roster_service import update_team as update_team_row
from backend.api.schemas import (
    MemberOut,
    MembersOut,
    MemberSearchOut,
    SlotAssignIn,
    SlotEnvelopeOut,
    SlotOut,
    SlotsOut,
    TeamCreateIn,
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
    return MemberOut(id=member.id, name=member.name, cohort=member.cohort)


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


# 요청한 사람이 누구인지 쓰지 않고 로그인만 확인하는 endpoint 는, 쓰이지 않는 인자를
# 남기지 않도록 dependencies 로 건다.
@router.get("/teams", response_model=TeamsOut, dependencies=[Depends(require_account)])
def read_teams(session: Session = Depends(get_session)) -> TeamsOut:
    return TeamsOut(
        teams=[
            _team_out(team, slot_count, filled_count)
            for team, filled_count, slot_count in list_teams(session)
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
    try:
        rows = list_slots(session, team_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return SlotsOut(slots=[_slot_out(slot, member) for slot, member in rows])


@router.get(
    "/teams/{team_id}/members",
    response_model=MembersOut,
    dependencies=[Depends(require_account)],
)
def read_team_members(
    team_id: int, session: Session = Depends(get_session)
) -> MembersOut:
    """자리에 앉은 사람만 돌려준다. 빈 자리를 함께 보려면 slots 쪽을 쓴다 —
    달력의 "이날 나오는 사람"은 사람만 필요해 이 endpoint 를 그대로 둔다."""
    try:
        rows = list_slots(session, team_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return MembersOut(
        members=[_member_out(member) for _, member in rows if member is not None]
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
    """자리에 앉힐 사람을 이름으로 찾는다. 빈 검색어에는 아무것도 주지 않는다 —
    명단을 통째로 내주는 통로가 되면 안 된다."""
    return MemberSearchOut(
        members=[_member_out(member) for member in search_members(session, q)]
    )


@router.post(
    "/teams",
    response_model=TeamEnvelopeOut,
    status_code=201,
    dependencies=[Depends(require_permission("team_manage"))],
)
def create_team(
    req: TeamCreateIn, session: Session = Depends(get_session)
) -> TeamEnvelopeOut:
    try:
        team = create_team_row(session, req.name, req.slots)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    # 방금 만든 자리는 전부 비어 있다 — 세어 볼 것 없이 앉은 사람은 0이다.
    slot_count = sum(count for count in req.slots.values() if count > 0)
    return TeamEnvelopeOut(team=_team_out(team, slot_count, 0))


@router.patch(
    "/teams/{team_id}",
    response_model=TeamEnvelopeOut,
    dependencies=[Depends(require_permission("team_manage"))],
)
def patch_team(
    team_id: int, req: TeamUpdateIn, session: Session = Depends(get_session)
) -> TeamEnvelopeOut:
    try:
        team = update_team_row(session, team_id, req.name)
        rows = list_slots(session, team_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    filled = sum(1 for _, member in rows if member is not None)
    return TeamEnvelopeOut(team=_team_out(team, len(rows), filled))


@router.put(
    "/teams/{team_id}/slots/{slot_id}",
    response_model=SlotEnvelopeOut,
    dependencies=[Depends(require_permission("team_manage"))],
)
def put_slot_member(
    team_id: int,
    slot_id: int,
    req: SlotAssignIn,
    session: Session = Depends(get_session),
) -> SlotEnvelopeOut:
    """자리에 사람을 앉힌다. 팀 구성은 팀을 다루는 항목이 가른다."""
    try:
        slot = assign_slot_row(session, team_id, slot_id, req.member_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return SlotEnvelopeOut(slot=_slot_out(slot, session.get(Member, req.member_id)))


@router.delete("/teams/{team_id}/slots/{slot_id}", status_code=204)
def delete_slot_member(
    team_id: int,
    slot_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    """자리를 비운다. 자리 자체는 남는다.

    이 endpoint 만 항목 전체로 막지 않는다 — 본인이 스스로 빠지는 것은 항목이 없어도
    되기 때문이다. 그래서 로그인만 확인해 들여보낸 뒤 안에서 본인인지를 함께 본다.
    """
    slot = session.get(TeamSlot, slot_id)
    if slot is None or slot.team_id != team_id:
        raise HTTPException(status_code=422, detail="그런 자리가 없습니다")

    mine = slot.member_id == requester.id
    if not mine and "member_remove" not in account_permissions(session, requester.id):
        raise HTTPException(status_code=403, detail="권한이 없습니다")

    try:
        clear_slot_row(session, team_id, slot_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
