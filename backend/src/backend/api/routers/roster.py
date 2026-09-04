from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.api.roster_service import create_team as create_team_row
from backend.api.roster_service import join_team as join_team_row
from backend.api.roster_service import leave_team as leave_team_row
from backend.api.roster_service import list_members, list_positions, list_teams
from backend.api.roster_service import rename_team, team_member_count
from backend.api.schemas import (
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
from backend.db.models import Member, Position, Team
from backend.db.pipeline import get_session

router = APIRouter()


def _team_out(team: Team, member_count: int) -> TeamOut:
    return TeamOut(id=team.id, name=team.name, member_count=member_count)


def _member_out(member: Member, positions: list[str]) -> MemberOut:
    return MemberOut(id=member.id, name=member.name, positions=positions)


def _position_out(position: Position) -> PositionOut:
    return PositionOut(id=position.id, name=position.name)


@router.get("/teams", response_model=TeamsOut)
def read_teams(session: Session = Depends(get_session)) -> TeamsOut:
    return TeamsOut(
        teams=[_team_out(team, count) for team, count in list_teams(session)]
    )


@router.get("/teams/{team_id}/members", response_model=MembersOut)
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


@router.get("/positions", response_model=PositionsOut)
def read_positions(session: Session = Depends(get_session)) -> PositionsOut:
    return PositionsOut(positions=[_position_out(p) for p in list_positions(session)])


@router.post("/teams", response_model=TeamEnvelopeOut, status_code=201)
def create_team(
    req: TeamCreateIn, session: Session = Depends(get_session)
) -> TeamEnvelopeOut:
    try:
        team = create_team_row(session, req.name, req.requested_by)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return TeamEnvelopeOut(team=_team_out(team, member_count=0))


@router.patch("/teams/{team_id}", response_model=TeamEnvelopeOut)
def patch_team(
    team_id: int, req: TeamUpdateIn, session: Session = Depends(get_session)
) -> TeamEnvelopeOut:
    try:
        team = rename_team(session, team_id, req.name, req.requested_by)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return TeamEnvelopeOut(team=_team_out(team, team_member_count(session, team.id)))


@router.post(
    "/teams/{team_id}/members", response_model=MembershipEnvelopeOut, status_code=201
)
def join_team(
    team_id: int, req: MembershipCreateIn, session: Session = Depends(get_session)
) -> MembershipEnvelopeOut:
    try:
        membership, member_name, position_name = join_team_row(
            session, team_id, req.member_id, req.position_id
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return MembershipEnvelopeOut(
        membership=MembershipOut(
            member_id=membership.member_id,
            member_name=member_name,
            team_id=membership.team_id,
            position=position_name,
        )
    )


@router.delete("/teams/{team_id}/members/{member_id}", status_code=204)
def leave_team(
    team_id: int, member_id: int, session: Session = Depends(get_session)
) -> None:
    try:
        leave_team_row(session, team_id, member_id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
