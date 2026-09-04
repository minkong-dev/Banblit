from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import Member, Membership, Position, Team

# 실제 DB에서 확인한 유니크 제약(docker compose exec db psql -c "\d teams" / "\d memberships").
TEAM_NAME_CONSTRAINT = "teams_name_key"
MEMBERSHIP_UNIQUE_CONSTRAINT = "memberships_member_id_team_id_key"


def list_teams(session: Session) -> list[tuple[Team, int]]:
    """팀을 id 오름차순으로 돌려주며, 각 팀의 소속 인원 수를 한 번의 집계 질의로 붙인다."""
    counts = {
        team_id: count
        for team_id, count in session.execute(
            select(Membership.team_id, func.count(Membership.id)).group_by(
                Membership.team_id
            )
        ).all()
    }
    teams = session.scalars(select(Team).order_by(Team.id)).all()
    return [(team, counts.get(team.id, 0)) for team in teams]


def list_members(session: Session, team_id: int) -> list[tuple[Member, list[str]]]:
    """team_id 팀의 소속원을 id 오름차순으로, 각자의 포지션과 함께 돌려준다.

    memberships는 (member_id, team_id)가 유일해 한 팀 안에서 한 사람은 한 행만
    가지므로, 행마다 포지션 하나를 담은 한 칸짜리 목록으로 감싸면 된다.
    """
    if session.get(Team, team_id) is None:
        raise ValueError("그런 팀이 없습니다")

    rows = session.execute(
        select(Member, Position.name)
        .join(Membership, Membership.member_id == Member.id)
        .join(Position, Position.id == Membership.position_id)
        .where(Membership.team_id == team_id)
        .order_by(Member.id)
    ).all()
    return [(member, [position_name]) for member, position_name in rows]


def list_positions(session: Session) -> list[Position]:
    return list(session.scalars(select(Position).order_by(Position.id)).all())


def team_member_count(session: Session, team_id: int) -> int:
    """팀 하나의 소속 인원 수. list_teams의 집계는 전체 팀을 한 번에 세므로, 팀 하나만
    다시 보여줘야 하는 자리(생성·수정 직후 응답)에서는 이 쪽을 쓴다."""
    return session.execute(
        select(func.count(Membership.id)).where(Membership.team_id == team_id)
    ).scalar_one()


def require_team_name(name: str) -> str:
    """빈 이름·공백만 있는 이름을 거절하고, 앞뒤 공백을 뗀 이름을 돌려준다."""
    trimmed = name.strip()
    if not trimmed:
        raise ValueError("팀 이름을 입력해 주세요")
    return trimmed


def _get_member_or_raise(session: Session, member_id: int) -> Member:
    member = session.get(Member, member_id)
    if member is None:
        raise ValueError("그런 사람이 없습니다")
    return member


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


def _require_not_already_member(session: Session, team_id: int, member_id: int) -> None:
    row = session.execute(
        select(Membership.id).where(
            Membership.team_id == team_id, Membership.member_id == member_id
        )
    ).first()
    if row is not None:
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


def create_team(session: Session, name: str, requested_by: int) -> Team:
    """새 팀을 만든다. 경계에서 이름·요청자·이름 중복을 사람이 읽을 문장으로 거절한다."""
    # 로그인이 붙으면 여기서 요청자가 헤드매니저인지 확인한다. 지금은 요청한 사람이
    # 누구인지 서버가 모르므로 이 규칙을 걸 수 없다.
    clean_name = require_team_name(name)
    _get_member_or_raise(session, requested_by)
    _require_unique_team_name(session, clean_name, exclude_id=None)

    team = Team(name=clean_name)
    session.add(team)
    commit_roster(session)
    return team


def rename_team(session: Session, team_id: int, name: str, requested_by: int) -> Team:
    """팀 이름을 고친다. 자기 이름을 그대로 두는 요청은 거부하지 않는다."""
    # 로그인이 붙으면 여기서 요청자가 헤드매니저인지 확인한다. 지금은 요청한 사람이
    # 누구인지 서버가 모르므로 이 규칙을 걸 수 없다.
    team = _get_team_or_raise(session, team_id)
    _get_member_or_raise(session, requested_by)
    clean_name = require_team_name(name)
    _require_unique_team_name(session, clean_name, exclude_id=team_id)

    team.name = clean_name
    commit_roster(session)
    return team


def join_team(
    session: Session, team_id: int, member_id: int, position_id: int
) -> tuple[Membership, str, str]:
    """member_id를 team_id에 position_id로 참가시킨다. 이미 속해 있으면 거절한다.

    참가는 승인 없이 바로 성립한다 — 로그인이 없어 스스로 참가하는 사람과 멤버를
    직접 넣는 헤드매니저를 구분할 수 없어, 팀마다 자동 승인/직접 승인을 가르는
    화면(.cluedoc/teams/README.md의 참가 흐름)은 아직 만들지 않았다. 대기 상태를
    지금 추가해도 승인할 화면이 없어 아무도 벗어날 수 없는 자리가 된다 — 로그인과
    승인 화면이 붙으면 멤버십에 상태(대기/승인) 열을 추가한다.
    """
    # 로그인이 붙으면 여기서 요청자가 이 member_id 본인이거나 헤드매니저인지 확인한다.
    # 지금은 요청한 사람이 누구인지 서버가 모르므로 이 규칙을 걸 수 없다.
    _get_team_or_raise(session, team_id)
    member = _get_member_or_raise(session, member_id)
    position = _get_position_or_raise(session, position_id)
    _require_not_already_member(session, team_id, member_id)

    membership = Membership(member_id=member_id, team_id=team_id, position_id=position_id)
    session.add(membership)
    commit_roster(session)
    return membership, member.name, position.name


def leave_team(session: Session, team_id: int, member_id: int) -> None:
    """member_id를 team_id 소속에서 뺀다. 소속이 아니면 거절한다."""
    # 로그인이 붙으면 여기서 요청자가 이 member_id 본인이거나 헤드매니저인지 확인한다.
    # 지금은 요청한 사람이 누구인지 서버가 모르므로 이 규칙을 걸 수 없다.
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
