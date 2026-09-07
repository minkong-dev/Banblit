from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import (
    JoinPolicy,
    Member,
    Membership,
    MembershipStatus,
    Position,
    Team,
)

# 실제 DB에서 확인한 유니크 제약(docker compose exec db psql -c "\d teams" / "\d memberships").
TEAM_NAME_CONSTRAINT = "teams_name_key"
MEMBERSHIP_UNIQUE_CONSTRAINT = "memberships_member_id_team_id_key"


def list_teams(session: Session) -> list[tuple[Team, int]]:
    """팀을 id 오름차순으로 돌려주며, 각 팀의 소속 인원 수를 한 번의 집계 질의로 붙인다.

    승인 대기(status="pending")는 아직 소속이 아니므로 세지 않는다.
    """
    counts = {
        team_id: count
        for team_id, count in session.execute(
            select(Membership.team_id, func.count(Membership.id))
            .where(Membership.status == "approved")
            .group_by(Membership.team_id)
        ).all()
    }
    teams = session.scalars(select(Team).order_by(Team.id)).all()
    return [(team, counts.get(team.id, 0)) for team in teams]


def _team_people(
    session: Session, team_id: int, status: str
) -> list[tuple[Member, str]]:
    """team_id 팀에서 status 상태인 사람과 그 포지션 이름을, 사람 번호 순으로 돌려준다."""
    rows = session.execute(
        select(Member, Position.name)
        .join(Membership, Membership.member_id == Member.id)
        .join(Position, Position.id == Membership.position_id)
        .where(Membership.team_id == team_id, Membership.status == status)
        .order_by(Member.id)
    ).all()
    return [(member, position_name) for member, position_name in rows]


def list_members(session: Session, team_id: int) -> list[tuple[Member, list[str]]]:
    """team_id 팀의 소속원을 id 오름차순으로, 각자의 포지션과 함께 돌려준다.

    memberships는 (member_id, team_id)가 유일해 한 팀 안에서 한 사람은 한 행만
    가지므로, 행마다 포지션 하나를 담은 한 칸짜리 목록으로 감싸면 된다.
    승인 대기는 아직 소속이 아니므로 빠진다.
    """
    if session.get(Team, team_id) is None:
        raise ValueError("그런 팀이 없습니다")

    return [
        (member, [position_name])
        for member, position_name in _team_people(session, team_id, "approved")
    ]


def list_my_memberships(
    session: Session, member_id: int
) -> list[tuple[Team, str, MembershipStatus]]:
    """member_id 가 가진 소속과 신청을 (팀, 포지션 이름, 상태)로 팀 번호 순으로 돌려준다.

    승인된 것과 대기 중인 것을 함께 담는다 — 가르는 것은 status 다.
    """
    rows = session.execute(
        select(Team, Position.name, Membership.status)
        .join(Membership, Membership.team_id == Team.id)
        .join(Position, Position.id == Membership.position_id)
        .where(Membership.member_id == member_id)
        .order_by(Team.id)
    ).all()
    return [(team, position_name, status) for team, position_name, status in rows]


def list_join_requests(session: Session, team_id: int) -> list[tuple[Member, str]]:
    """team_id 팀에 걸린 참가 신청을 (사람, 포지션 이름)으로 돌려준다."""
    _get_team_or_raise(session, team_id)
    return _team_people(session, team_id, "pending")


def list_positions(session: Session) -> list[Position]:
    return list(session.scalars(select(Position).order_by(Position.id)).all())


def team_member_count(session: Session, team_id: int) -> int:
    """팀 하나의 소속 인원 수. list_teams의 집계는 전체 팀을 한 번에 세므로, 팀 하나만
    다시 보여줘야 하는 자리(생성·수정 직후 응답)에서는 이 쪽을 쓴다."""
    return session.execute(
        select(func.count(Membership.id)).where(
            Membership.team_id == team_id, Membership.status == "approved"
        )
    ).scalar_one()


def require_team_name(name: str) -> str:
    """빈 이름·공백만 있는 이름을 거절하고, 앞뒤 공백을 뗀 이름을 돌려준다."""
    trimmed = name.strip()
    if not trimmed:
        raise ValueError("팀 이름을 입력해 주세요")
    return trimmed


def _get_team_or_raise(session: Session, team_id: int) -> Team:
    team = session.get(Team, team_id)
    if team is None:
        raise ValueError("그런 팀이 없습니다")
    return team


def _get_position_or_raise(session: Session, position_id: int) -> Position:
    position = session.get(Position, position_id)
    if position is None:
        raise ValueError("그런 포지션이 없습니다")
    return position


def _require_unique_team_name(session: Session, name: str, exclude_id: int | None) -> None:
    query = select(Team.id).where(Team.name == name)
    if exclude_id is not None:
        query = query.where(Team.id != exclude_id)
    if session.scalars(query).first() is not None:
        raise ValueError("이미 있는 팀 이름입니다")


def _require_no_membership_row(session: Session, team_id: int, member_id: int) -> None:
    """소속이든 신청이든 이미 행이 있으면 거절한다 — 유일 조건이 상태를 가리지 않는다."""
    status = session.execute(
        select(Membership.status).where(
            Membership.team_id == team_id, Membership.member_id == member_id
        )
    ).scalar_one_or_none()
    if status == "pending":
        raise ValueError("이미 참가를 신청한 팀입니다")
    if status is not None:
        raise ValueError("이미 그 팀 소속입니다")


def duplicate_message(error: IntegrityError) -> str | None:
    """유니크 위반이 팀 이름 중복이나 이중 참가면 사람이 읽을 문장을, 아니면 None을 돌려준다.

    이름·참가 사전 검사(SELECT)와 commit 사이에는 잠금이 없다. 같은 이름·같은 참가가
    동시에 들어오면 둘 다 사전 검사를 통과하고, 나중 커밋에서 이 제약이 걸릴 수 있다 —
    room_service.duplicate_name_message와 같은 얼개로 잡는다.
    """
    diag = getattr(error.orig, "diag", None)
    constraint_name = getattr(diag, "constraint_name", None)
    if constraint_name == TEAM_NAME_CONSTRAINT:
        return "이미 있는 팀 이름입니다"
    if constraint_name == MEMBERSHIP_UNIQUE_CONSTRAINT:
        return "이미 그 팀 소속입니다"
    return None


def commit_roster(session: Session) -> None:
    """커밋 시점에 실제로 걸린 이름·참가 중복을 사람이 읽을 문장으로 바꿔 올린다.

    모르는 제약이면 원래 IntegrityError를 그대로 올려 500으로 드러나게 둔다 —
    아는 사고가 아닌데 아는 척 문구를 붙이면 엉뚱한 곳을 고치게 만든다.
    """
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        message = duplicate_message(error)
        if message is None:
            raise
        raise ValueError(message) from error


def create_team(session: Session, name: str) -> Team:
    """name 으로 새 팀을 만들어 돌려준다. 빈 이름과 이미 있는 이름을 거절한다.

    누가 만들 수 있는지는 통로(routers/roster.py)의 team_manage 확인이 가른다.
    """
    clean_name = require_team_name(name)
    _require_unique_team_name(session, clean_name, exclude_id=None)

    team = Team(name=clean_name)
    session.add(team)
    commit_roster(session)
    return team


def update_team(
    session: Session, team_id: int, name: str, join_policy: JoinPolicy | None
) -> Team:
    """team_id 팀의 이름을 name 으로 바꿔 돌려준다. 자기 이름을 그대로 두는 요청은
    거부하지 않는다. join_policy 가 None 이면 참가 승인 방식은 건드리지 않는다."""
    team = _get_team_or_raise(session, team_id)
    clean_name = require_team_name(name)
    _require_unique_team_name(session, clean_name, exclude_id=team_id)

    team.name = clean_name
    if join_policy is not None:
        team.join_policy = join_policy
    commit_roster(session)
    return team


def join_team(
    session: Session, team_id: int, member: Member, position_id: int
) -> tuple[Membership, str, str]:
    """member 를 team_id 에 position_id 로 참가시키고, (소속, 사람 이름, 포지션 이름)을
    돌려준다. 이미 소속이거나 이미 신청해 둔 상태면 거절한다.

    팀의 join_policy 가 "auto" 면 status="approved" 로 바로 소속이 되고,
    "approval" 이면 status="pending" 으로 신청만 걸린다.
    """
    team = _get_team_or_raise(session, team_id)
    position = _get_position_or_raise(session, position_id)
    _require_no_membership_row(session, team_id, member.id)

    membership = Membership(
        member_id=member.id,
        team_id=team_id,
        position_id=position_id,
        status="approved" if team.join_policy == "auto" else "pending",
    )
    session.add(membership)
    commit_roster(session)
    return membership, member.name, position.name


def _get_pending_or_raise(session: Session, team_id: int, member_id: int) -> Membership:
    _get_team_or_raise(session, team_id)
    # with_for_update 는 찾은 행에 잠금을 걸어, 같은 신청에 대한 승인과 거절이 겹쳐
    # 들어와도 한 번에 하나만 지나가게 한다. PostgreSQL 은 잠금을 얻은 뒤 where 를
    # 다시 재는데, 앞선 요청이 이미 승인해 두었다면 status 가 더 이상 "pending" 이
    # 아니라 여기서 걸러진다 — 잠금이 없으면 뒤늦은 거절이 방금 승인된 소속을
    # 그대로 지운다.
    membership = session.execute(
        select(Membership)
        .where(
            Membership.team_id == team_id,
            Membership.member_id == member_id,
            Membership.status == "pending",
        )
        .with_for_update()
    ).scalar_one_or_none()
    if membership is None:
        raise ValueError("그런 참가 신청이 없습니다")
    return membership


def approve_join_request(
    session: Session, team_id: int, member_id: int
) -> tuple[Membership, str, str]:
    """대기 중인 신청을 소속으로 바꾸고, join_team 과 같은 (소속, 사람 이름, 포지션 이름)을
    돌려준다. 누가 승인할 수 있는지는 통로의 join_approve 확인이 가른다."""
    membership = _get_pending_or_raise(session, team_id, member_id)
    membership.status = "approved"
    session.commit()

    member_name, position_name = session.execute(
        select(Member.name, Position.name)
        .join(Membership, Membership.member_id == Member.id)
        .join(Position, Position.id == Membership.position_id)
        .where(Membership.id == membership.id)
    ).one()
    return membership, member_name, position_name


def reject_join_request(session: Session, team_id: int, member_id: int) -> None:
    """대기 중인 신청을 지운다. 이미 소속인 사람은 이 통로로 뺄 수 없다."""
    membership = _get_pending_or_raise(session, team_id, member_id)
    session.delete(membership)
    session.commit()


def leave_team(
    session: Session,
    team_id: int,
    member_id: int,
    requester: Member,
    may_remove_others: bool,
) -> None:
    """member_id 를 team_id 소속에서 뺀다. 소속도 신청도 없으면 거절한다.

    상태를 가리지 않고 지우므로, 대기 중인 본인 신청을 취소하는 것도 이 통로다.

    may_remove_others 는 requester 가 member_remove 항목을 가졌는지다. 본인도
    아니고 그 항목도 없으면 PermissionError 를 올린다 —
    board_service._require_team_member 와 같이, 대상이 아예 없는 경우(ValueError)와
    사람이 다음에 할 일이 다르므로 구분한다.
    """
    if requester.id != member_id and not may_remove_others:
        raise PermissionError("본인 또는 권한을 가진 사람만 소속을 뺄 수 있습니다")

    _get_team_or_raise(session, team_id)
    membership = session.execute(
        select(Membership).where(
            Membership.team_id == team_id, Membership.member_id == member_id
        )
    ).scalar_one_or_none()
    if membership is None:
        raise ValueError("그 팀 소속이 아닙니다")

    session.delete(membership)
    session.commit()
