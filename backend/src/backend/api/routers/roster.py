from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.auth_dependency import require_account, require_permission
from backend.api.permission_service import account_permissions
from backend.api.roster_service import approve_join_request
from backend.api.roster_service import create_team as create_team_row
from backend.api.roster_service import join_team as join_team_row
from backend.api.roster_service import leave_team as leave_team_row
from backend.api.roster_service import list_join_requests, list_members
from backend.api.roster_service import list_positions, list_teams
from backend.api.roster_service import reject_join_request, team_member_count
from backend.api.roster_service import update_team as update_team_row
from backend.api.schemas import (
    JoinRequestOut,
    JoinRequestsOut,
    MemberOut,
    MembersOut,
    MembershipCreateIn,
    MembershipEnvelopeOut,
    MembershipOut,
    PositionOut,
    PositionsOut,
    TeamCreateIn,
    TeamEnvelopeOut,
    TeamOut,
    TeamsOut,
    TeamUpdateIn,
)
from backend.db.models import Member, Membership, Position, Team
from backend.db.pipeline import get_session

router = APIRouter()


def _membership_envelope(
    membership: Membership, member_name: str, position_name: str
) -> MembershipEnvelopeOut:
    return MembershipEnvelopeOut(
        membership=MembershipOut(
            member_id=membership.member_id,
            member_name=member_name,
            team_id=membership.team_id,
            position=position_name,
            status=membership.status,
        )
    )


def _team_out(team: Team, member_count: int) -> TeamOut:
    return TeamOut(
        id=team.id,
        name=team.name,
        member_count=member_count,
        join_policy=team.join_policy,
    )


def _member_out(member: Member, positions: list[str]) -> MemberOut:
    return MemberOut(id=member.id, name=member.name, positions=positions)


def _position_out(position: Position) -> PositionOut:
    return PositionOut(id=position.id, name=position.name)


# 요청한 사람이 누구인지 쓰지 않고 로그인만 확인하는 endpoint 는, 쓰이지 않는 인자를
# 남기지 않도록 dependencies 로 건다.
@router.get("/teams", response_model=TeamsOut, dependencies=[Depends(require_account)])
def read_teams(session: Session = Depends(get_session)) -> TeamsOut:
    return TeamsOut(
        teams=[_team_out(team, count) for team, count in list_teams(session)]
    )


@router.get(
    "/teams/{team_id}/members",
    response_model=MembersOut,
    dependencies=[Depends(require_account)],
)
def read_team_members(
    team_id: int, session: Session = Depends(get_session)
) -> MembersOut:
    try:
        rows = list_members(session, team_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return MembersOut(
        members=[_member_out(member, positions) for member, positions in rows]
    )


@router.get(
    "/positions", response_model=PositionsOut, dependencies=[Depends(require_account)]
)
def read_positions(session: Session = Depends(get_session)) -> PositionsOut:
    return PositionsOut(positions=[_position_out(p) for p in list_positions(session)])


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
        team = create_team_row(session, req.name)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return TeamEnvelopeOut(team=_team_out(team, member_count=0))


@router.patch(
    "/teams/{team_id}",
    response_model=TeamEnvelopeOut,
    dependencies=[Depends(require_permission("team_manage"))],
)
def patch_team(
    team_id: int, req: TeamUpdateIn, session: Session = Depends(get_session)
) -> TeamEnvelopeOut:
    try:
        team = update_team_row(session, team_id, req.name, req.join_policy)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return TeamEnvelopeOut(team=_team_out(team, team_member_count(session, team.id)))


@router.post(
    "/teams/{team_id}/members", response_model=MembershipEnvelopeOut, status_code=201
)
def join_team(
    team_id: int,
    req: MembershipCreateIn,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> MembershipEnvelopeOut:
    # 참가하는 사람은 언제나 요청을 보낸 본인이다 — 남을 대신 넣는 화면이 아직 없다.
    # 즉시 가입인지 신청만 걸렸는지는 팀의 join_policy 가 가르고, 결과는 status 에 실린다.
    try:
        membership, member_name, position_name = join_team_row(
            session, team_id, requester, req.position_id
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _membership_envelope(membership, member_name, position_name)


@router.get(
    "/teams/{team_id}/join-requests",
    response_model=JoinRequestsOut,
    dependencies=[Depends(require_permission("join_approve"))],
)
def read_join_requests(
    team_id: int, session: Session = Depends(get_session)
) -> JoinRequestsOut:
    try:
        rows = list_join_requests(session, team_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return JoinRequestsOut(
        join_requests=[
            JoinRequestOut(
                member_id=member.id, member_name=member.name, position=position_name
            )
            for member, position_name in rows
        ]
    )


@router.post(
    "/teams/{team_id}/join-requests/{member_id}/approve",
    response_model=MembershipEnvelopeOut,
    dependencies=[Depends(require_permission("join_approve"))],
)
def approve_join(
    team_id: int, member_id: int, session: Session = Depends(get_session)
) -> MembershipEnvelopeOut:
    try:
        membership, member_name, position_name = approve_join_request(
            session, team_id, member_id
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return _membership_envelope(membership, member_name, position_name)


@router.delete(
    "/teams/{team_id}/join-requests/{member_id}",
    status_code=204,
    dependencies=[Depends(require_permission("join_approve"))],
)
def reject_join(
    team_id: int, member_id: int, session: Session = Depends(get_session)
) -> None:
    try:
        reject_join_request(session, team_id, member_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("/teams/{team_id}/members/{member_id}", status_code=204)
def leave_team(
    team_id: int,
    member_id: int,
    requester: Member = Depends(require_account),
    session: Session = Depends(get_session),
) -> None:
    try:
        # 남을 뺄 수 있는지는 member_remove 항목이 가른다. 본인이 나가는 경우는
        # 그 항목이 없어도 되므로 endpoint 전체를 막지 않고 서비스에 함께 넘긴다.
        may_remove_others = "member_remove" in account_permissions(session, requester.id)
        leave_team_row(session, team_id, member_id, requester, may_remove_others)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
