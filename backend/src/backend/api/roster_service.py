from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.api.input import require_non_empty
from backend.db.models import (
    INSTRUMENTS,
    Instrument,
    Member,
    MemberPermissionSet,
    PermissionSet,
    Team,
    TeamSlot,
)
from backend.db.pipeline import commit_translating

# 걸릴 수 있는 제약과 그때 사람에게 보일 문장. 이름은 마이그레이션이 만든 것이다.
ROSTER_MESSAGES = {
    "teams_name_key": "이미 있는 팀 이름입니다",
    "team_slots_team_id_member_id_key": "이미 그 팀의 다른 포지션에 있는 사람입니다",
    "team_slots_team_id_instrument_ordinal_key": "이미 있는 포지션입니다",
}

# 한 팀의 포지션 수 상한. 배정 계산이 팀당 멤버를 10명까지만 받으므로 그 값에 맞춘다 —
# 여기서 더 받아 두면 포지션는 만들어지는데 배정이 통째로 거절된다.
MAX_SLOTS_PER_TEAM = 10


def list_teams(session: Session) -> list[tuple[Team, int, int]]:
    """팀을 id 오름차순으로, 각 팀의 (전체 포지션 수, 사람이 들어간 포지션 수)와 함께 돌려준다.

    두 수를 함께 주는 것은 화면이 "6명 중 4명"처럼 보여주기 때문이다. 인원 수 하나만
    주면 포지션가 몇 개 비었는지 화면이 알 수 없다.
    """
    rows = session.execute(
        select(
            TeamSlot.team_id,
            func.count(TeamSlot.id),
            func.count(TeamSlot.member_id),
        ).group_by(TeamSlot.team_id)
    ).all()
    counts = {team_id: (total, filled) for team_id, total, filled in rows}
    teams = session.scalars(select(Team).order_by(Team.id)).all()
    return [(team, *counts.get(team.id, (0, 0))) for team in teams]


def list_slots(session: Session, team_id: int) -> list[tuple[TeamSlot, Member | None]]:
    """팀의 포지션를 악기·번호 순으로, 그 포지션에 들어간 사람과 함께 돌려준다.

    빈 포지션도 함께 나온다 — 화면이 채워야 할 곳을 보여줘야 하므로 빼면 안 된다.
    """
    _get_team_or_raise(session, team_id)
    rows = session.execute(
        select(TeamSlot, Member)
        .outerjoin(Member, Member.id == TeamSlot.member_id)
        .where(TeamSlot.team_id == team_id)
        .order_by(TeamSlot.instrument, TeamSlot.ordinal)
    ).tuples().all()
    return [(slot, member) for slot, member in rows]


def list_my_teams(session: Session, member_id: int) -> list[tuple[Team, TeamSlot]]:
    """그 사람이 들어가 있는 포지션를 팀과 함께 돌려준다."""
    rows = session.execute(
        select(Team, TeamSlot)
        .join(TeamSlot, TeamSlot.team_id == Team.id)
        .where(TeamSlot.member_id == member_id)
        .order_by(Team.id)
    ).tuples().all()
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
    """이름으로 사람을 찾는다. 포지션에 넣을 사람을 고르는 돋보기가 쓴다.

    빈 검색어에 전체를 돌려주지 않는다 — 명단을 통째로 내주는 자리가 되면 안 된다.
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


def require_slot_counts(counts: dict[str, int]) -> dict[Instrument, int]:
    """악기마다 몇 포지션인지를 받아 확인한다. 0인 악기는 포지션를 만들지 않으므로 버린다."""
    checked: dict[Instrument, int] = {}
    for name, count in counts.items():
        if name not in INSTRUMENTS:
            raise ValueError(f"알 수 없는 악기입니다: {name}")
        if count < 0:
            raise ValueError("포지션 수는 0보다 작을 수 없습니다")
        if count > 0:
            checked[name] = count

    total = sum(checked.values())
    if total == 0:
        raise ValueError("악기를 하나 이상 골라 주세요")
    if total > MAX_SLOTS_PER_TEAM:
        raise ValueError(f"한 팀의 포지션는 {MAX_SLOTS_PER_TEAM}개까지입니다")
    return checked


def _get_team_or_raise(session: Session, team_id: int) -> Team:
    team = session.get(Team, team_id)
    if team is None:
        raise ValueError("그런 팀이 없습니다")
    return team


def _get_slot_or_raise(session: Session, team_id: int, slot_id: int) -> TeamSlot:
    slot = session.get(TeamSlot, slot_id)
    # 포지션 번호만 맞고 팀이 다르면 없는 것으로 본다 — 남의 팀 포지션를 번호로 건드릴 수 없다.
    if slot is None or slot.team_id != team_id:
        raise ValueError("그런 포지션가 없습니다")
    return slot


def create_team(session: Session, name: str, counts: dict[str, int]) -> Team:
    """팀을 만들면서 악기 포지션를 함께 만든다.

    포지션를 나중에 따로 만들지 않는 것은, 포지션 없는 팀이 잠깐이라도 저장되면 그 팀이
    배정에서 "아무도 없는 팀"으로 취급되기 때문이다. 팀과 포지션는 한 번에 들어간다.
    """
    clean_name = require_non_empty(name, "팀 이름")
    checked = require_slot_counts(counts)

    team = Team(name=clean_name)
    session.add(team)
    # 포지션를 만들려면 팀 번호가 먼저 필요해 flush 한다 — 이름 중복은 여기서 걸린다.
    commit_translating(session, ROSTER_MESSAGES, session.flush)
    session.add_all(
        TeamSlot(team_id=team.id, instrument=instrument, ordinal=ordinal)
        for instrument, count in checked.items()
        for ordinal in range(1, count + 1)
    )
    commit_translating(session, ROSTER_MESSAGES)
    return team


def update_team(session: Session, team_id: int, name: str) -> Team:
    """팀 이름을 바꾼다. 포지션 구성을 바꾸는 것은 포지션 쪽 endpoint 가 맡는다."""
    team = _get_team_or_raise(session, team_id)
    team.name = require_non_empty(name, "팀 이름")
    commit_translating(session, ROSTER_MESSAGES)
    return team


def replace_slots(session: Session, team_id: int, counts: dict[str, int]) -> None:
    """팀의 포지션 구성을 통째로 다시 세운다.

    악기마다 몇 포지션인지만 받고, 그 수에 맞춰 포지션를 더하거나 뺀다. 이미 있던
    (악기, 번호) 는 그대로 두어 그 포지션에 있던 사람이 남는다 — 드럼을 하나에서 둘로
    늘렸다고 원래 드럼을 치던 사람이 포지션를 잃으면 안 된다.

    줄일 때는 번호가 큰 포지션부터 없앤다. 거기 있던 사람은 팀에서 빠진다.
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
    commit_translating(session, ROSTER_MESSAGES)


def delete_team(session: Session, team_id: int) -> None:
    """팀을 지운다. 포지션는 팀의 구성이라 함께 사라진다.

    포지션에 들어가 있던 사람은 그대로 남는다 — 사람은 팀보다 오래 산다.
    """
    team = _get_team_or_raise(session, team_id)
    session.execute(delete(TeamSlot).where(TeamSlot.team_id == team_id))
    session.delete(team)
    commit_translating(session, ROSTER_MESSAGES)


def assign_slot(session: Session, team_id: int, slot_id: int, member_id: int) -> TeamSlot:
    """포지션에 사람을 넣는다. 이미 들어가 있던 사람이 있으면 그 사람이 밀려난다."""
    slot = _get_slot_or_raise(session, team_id, slot_id)
    if session.get(Member, member_id) is None:
        raise ValueError("그런 사람이 없습니다")
    slot.member_id = member_id
    commit_translating(session, ROSTER_MESSAGES)
    return slot


def clear_slot(session: Session, team_id: int, slot_id: int) -> TeamSlot:
    """포지션를 비운다. 포지션 자체는 남는다 — 팀 구성이 바뀐 것이 아니라 사람만 빠진 것이다."""
    slot = _get_slot_or_raise(session, team_id, slot_id)
    slot.member_id = None
    commit_translating(session, ROSTER_MESSAGES)
    return slot
