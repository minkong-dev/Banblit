from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db.models import MemberPermissionSet, PermissionSet
from backend.db.models import INSTRUMENTS, Instrument, Member, Team, TeamSlot

# 실제 DB에서 확인한 유니크 제약
# (docker compose exec db psql -c "\d teams" / "\d team_slots").
TEAM_NAME_CONSTRAINT = "teams_name_key"
SLOT_PLACE_CONSTRAINT = "team_slots_team_id_instrument_ordinal_key"
SLOT_MEMBER_CONSTRAINT = "team_slots_team_id_member_id_key"

# 한 팀의 자리 수 상한. 배정 계산이 팀당 멤버를 10명까지만 받으므로 그 값에 맞춘다 —
# 여기서 더 받아 두면 자리는 만들어지는데 배정이 통째로 거절된다.
MAX_SLOTS_PER_TEAM = 10


def list_teams(session: Session) -> list[tuple[Team, int, int]]:
    """팀을 id 오름차순으로, 각 팀의 (사람이 앉은 자리 수, 전체 자리 수)와 함께 돌려준다.

    두 수를 함께 주는 것은 화면이 "6명 중 4명"처럼 보여주기 때문이다. 인원 수 하나만
    주면 자리가 몇 개 비었는지 화면이 알 수 없다.
    """
    rows = session.execute(
        select(
            TeamSlot.team_id,
            func.count(TeamSlot.id),
            func.count(TeamSlot.member_id),
        ).group_by(TeamSlot.team_id)
    ).all()
    counts = {team_id: (filled, total) for team_id, total, filled in rows}
    teams = session.scalars(select(Team).order_by(Team.id)).all()
    return [(team, *counts.get(team.id, (0, 0))) for team in teams]


def list_slots(session: Session, team_id: int) -> list[tuple[TeamSlot, Member | None]]:
    """팀의 자리를 악기·번호 순으로, 그 자리에 앉은 사람과 함께 돌려준다.

    빈 자리도 함께 나온다 — 화면이 채워야 할 곳을 보여줘야 하므로 빼면 안 된다.
    """
    _get_team_or_raise(session, team_id)
    rows = session.execute(
        select(TeamSlot, Member)
        .outerjoin(Member, Member.id == TeamSlot.member_id)
        .where(TeamSlot.team_id == team_id)
        .order_by(TeamSlot.instrument, TeamSlot.ordinal)
    ).all()
    return [(slot, member) for slot, member in rows]


def list_my_teams(session: Session, member_id: int) -> list[tuple[Team, TeamSlot]]:
    """그 사람이 앉아 있는 자리를 팀과 함께 돌려준다."""
    rows = session.execute(
        select(Team, TeamSlot)
        .join(TeamSlot, TeamSlot.team_id == Team.id)
        .where(TeamSlot.member_id == member_id)
        .order_by(Team.id)
    ).all()
    return [(team, slot) for team, slot in rows]


def list_members(
    session: Session, after: int | None, limit: int
) -> list[tuple[Member, list[str]]]:
    """모든 사람을 번호순으로 돌려준다. 사람마다 가진 권한 묶음 이름이 함께 온다.

    무한 스크롤이라 쪽 번호가 아니라 "마지막으로 받은 번호 다음부터"로 이어 받는다 —
    보는 중에 사람이 늘거나 줄어도 이미 본 줄이 다시 나오거나 건너뛰지 않는다.
    """
    rows = session.scalars(
        select(Member)
        .where(Member.id > (after or 0))
        .order_by(Member.id)
        .limit(limit)
    ).all()
    if not rows:
        return []

    held: dict[int, list[str]] = {row.id: [] for row in rows}
    for member_id, name in session.execute(
        select(MemberPermissionSet.member_id, PermissionSet.name)
        .join(PermissionSet, PermissionSet.id == MemberPermissionSet.permission_set_id)
        .where(MemberPermissionSet.member_id.in_(held))
        .order_by(PermissionSet.name)
    ).all():
        held[member_id].append(name)
    return [(row, held[row.id]) for row in rows]


def search_members(session: Session, query: str, limit: int = 20) -> list[Member]:
    """이름으로 사람을 찾는다. 자리에 앉힐 사람을 고르는 돋보기가 쓴다.

    빈 검색어에 전체를 돌려주지 않는다 — 명단을 통째로 내주는 통로가 되면 안 된다.
    동명이인이 있으므로 결과에는 기수가 함께 실린다(부르는 쪽이 붙인다).
    """
    trimmed = query.strip()
    if not trimmed:
        return []
    return list(
        session.scalars(
            select(Member)
            .where(Member.name.ilike(f"%{trimmed}%"))
            .order_by(Member.name, Member.id)
            .limit(limit)
        ).all()
    )


def require_team_name(name: str) -> str:
    """빈 이름·공백만 있는 이름을 거절하고, 앞뒤 공백을 뗀 이름을 돌려준다."""
    trimmed = name.strip()
    if not trimmed:
        raise ValueError("팀 이름을 입력해 주세요")
    return trimmed


def require_slot_counts(counts: dict[str, int]) -> dict[Instrument, int]:
    """악기마다 몇 자리인지를 받아 확인한다. 0인 악기는 자리를 만들지 않으므로 버린다."""
    checked: dict[Instrument, int] = {}
    for name, count in counts.items():
        if name not in INSTRUMENTS:
            raise ValueError(f"알 수 없는 악기입니다: {name}")
        if count < 0:
            raise ValueError("자리 수는 0보다 작을 수 없습니다")
        if count > 0:
            checked[name] = count

    total = sum(checked.values())
    if total == 0:
        raise ValueError("악기를 하나 이상 골라 주세요")
    if total > MAX_SLOTS_PER_TEAM:
        raise ValueError(f"한 팀의 자리는 {MAX_SLOTS_PER_TEAM}개까지입니다")
    return checked


def _get_team_or_raise(session: Session, team_id: int) -> Team:
    team = session.get(Team, team_id)
    if team is None:
        raise ValueError("그런 팀이 없습니다")
    return team


def _get_slot_or_raise(session: Session, team_id: int, slot_id: int) -> TeamSlot:
    slot = session.get(TeamSlot, slot_id)
    # 자리 번호만 맞고 팀이 다르면 없는 것으로 본다 — 남의 팀 자리를 번호로 건드릴 수 없다.
    if slot is None or slot.team_id != team_id:
        raise ValueError("그런 자리가 없습니다")
    return slot


def _require_unique_team_name(
    session: Session, name: str, exclude_id: int | None
) -> None:
    query = select(Team.id).where(Team.name == name)
    if exclude_id is not None:
        query = query.where(Team.id != exclude_id)
    if session.scalars(query).first() is not None:
        raise ValueError("이미 있는 팀 이름입니다")


def duplicate_message(error: IntegrityError) -> str | None:
    """유니크 위반이 아는 사고면 사람이 읽을 문장을, 아니면 None을 돌려준다.

    사전 검사(SELECT)와 commit 사이에는 잠금이 없다. 같은 이름·같은 사람이 동시에
    들어오면 둘 다 사전 검사를 통과하고 나중 커밋에서 제약이 걸릴 수 있다 —
    room_service.duplicate_name_message와 같은 얼개로 잡는다.
    """
    diag = getattr(error.orig, "diag", None)
    constraint_name = getattr(diag, "constraint_name", None)
    if constraint_name == TEAM_NAME_CONSTRAINT:
        return "이미 있는 팀 이름입니다"
    if constraint_name == SLOT_MEMBER_CONSTRAINT:
        return "이미 그 팀의 다른 자리에 있는 사람입니다"
    if constraint_name == SLOT_PLACE_CONSTRAINT:
        return "이미 있는 자리입니다"
    return None


def commit_roster(session: Session) -> None:
    """커밋 시점에 실제로 걸린 중복을 사람이 읽을 문장으로 바꿔 올린다.

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


def create_team(session: Session, name: str, counts: dict[str, int]) -> Team:
    """팀을 만들면서 악기 자리를 함께 만든다.

    자리를 나중에 따로 만들지 않는 것은, 자리 없는 팀이 잠깐이라도 저장되면 그 팀이
    배정에서 "아무도 없는 팀"으로 취급되기 때문이다. 팀과 자리는 한 번에 들어간다.
    """
    clean_name = require_team_name(name)
    checked = require_slot_counts(counts)
    _require_unique_team_name(session, clean_name, exclude_id=None)

    team = Team(name=clean_name)
    session.add(team)
    session.flush()
    session.add_all(
        TeamSlot(team_id=team.id, instrument=instrument, ordinal=ordinal)
        for instrument, count in checked.items()
        for ordinal in range(1, count + 1)
    )
    commit_roster(session)
    return team


def update_team(session: Session, team_id: int, name: str) -> Team:
    """팀 이름을 바꾼다. 자리 구성을 바꾸는 것은 자리 쪽 통로가 맡는다."""
    team = _get_team_or_raise(session, team_id)
    clean_name = require_team_name(name)
    _require_unique_team_name(session, clean_name, exclude_id=team_id)
    team.name = clean_name
    commit_roster(session)
    return team


def replace_slots(session: Session, team_id: int, counts: dict[str, int]) -> None:
    """팀의 포지션 구성을 통째로 다시 세운다.

    악기마다 몇 자리인지만 받고, 그 수에 맞춰 자리를 더하거나 뺀다. 이미 있던
    (악기, 번호) 는 그대로 두어 그 자리에 있던 사람이 남는다 — 드럼을 하나에서 둘로
    늘렸다고 원래 드럼을 치던 사람이 자리를 잃으면 안 된다.

    줄일 때는 번호가 큰 자리부터 없앤다. 거기 있던 사람은 팀에서 빠진다.
    """
    _get_team_or_raise(session, team_id)
    checked = require_slot_counts(counts)

    keep: set[tuple[str, int]] = {
        (instrument, ordinal)
        for instrument, count in checked.items()
        for ordinal in range(1, count + 1)
    }
    rows = session.scalars(
        select(TeamSlot).where(TeamSlot.team_id == team_id)
    ).all()
    have = {(row.instrument, row.ordinal) for row in rows}

    for row in rows:
        if (row.instrument, row.ordinal) not in keep:
            session.delete(row)
    session.add_all(
        TeamSlot(team_id=team_id, instrument=instrument, ordinal=ordinal)
        for instrument, ordinal in sorted(keep - have)
    )
    commit_roster(session)


def delete_team(session: Session, team_id: int) -> None:
    """팀을 지운다. 자리는 팀의 구성이라 함께 사라진다.

    자리에 앉아 있던 사람은 그대로 남는다 — 사람은 팀보다 오래 산다.
    """
    team = _get_team_or_raise(session, team_id)
    session.execute(delete(TeamSlot).where(TeamSlot.team_id == team_id))
    session.delete(team)
    commit_roster(session)


def assign_slot(session: Session, team_id: int, slot_id: int, member_id: int) -> TeamSlot:
    """자리에 사람을 앉힌다. 이미 앉아 있던 사람이 있으면 그 사람이 밀려난다."""
    slot = _get_slot_or_raise(session, team_id, slot_id)
    if session.get(Member, member_id) is None:
        raise ValueError("그런 사람이 없습니다")
    slot.member_id = member_id
    commit_roster(session)
    return slot


def clear_slot(session: Session, team_id: int, slot_id: int) -> TeamSlot:
    """자리를 비운다. 자리 자체는 남는다 — 팀 구성이 바뀐 것이 아니라 사람만 빠진 것이다."""
    slot = _get_slot_or_raise(session, team_id, slot_id)
    slot.member_id = None
    commit_roster(session)
    return slot
