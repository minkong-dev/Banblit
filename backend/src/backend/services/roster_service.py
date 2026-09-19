from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from backend.services.input import require_non_empty
from backend.services.permission_service import require_another_full_set_holder
from backend.db.models import (
    INSTRUMENTS,
    TEAM_COLORS,
    Instrument,
    Member,
    MemberPermissionSet,
    PermissionSet,
    Team,
    TeamSlot,
)
from backend.db.pipeline import commit_translating

# 위반될 수 있는 제약 조건과 그때 사용자에게 표시할 문장입니다. 제약 조건 이름은 migration(DB 구조를 변경하는 단계별 기록)이 지정한 이름입니다.
ROSTER_MESSAGES = {
    "teams_name_key": "이미 있는 팀 이름입니다",
    # 선택한 색이 겹친 경우와, 색을 선택하지 않은 요청 둘이 동시에 같은 남은 색을 받은 경우 모두 이 제약에 걸립니다.
    "teams_color_key": "다른 팀이 쓰는 색입니다. 다시 시도하거나 다른 색을 선택해 주세요",
    # 색을 선택하지 않았는데 남은 색이 없을 때 트리거가 붙이는 이름입니다(migration c3f7b2e84d19).
    "teams_color_exhausted": (
        f"팀 색 {len(TEAM_COLORS)}개가 모두 쓰이고 있어 팀을 더 만들 수 없습니다. "
        "쓰지 않는 팀을 삭제한 뒤 만들어 주세요"
    ),
    "team_slots_team_id_member_id_key": "이미 그 팀의 다른 포지션에 있는 사람입니다",
    "team_slots_team_id_instrument_ordinal_key": "이미 있는 포지션입니다",
}

# 한 팀의 포지션 수 상한입니다. 배정 계산이 팀당 멤버를 최대 10명까지만 받으므로 그 값에 맞춥니다.
# 이 값보다 크게 허용하면 포지션은 생성되지만 그 팀이 포함된 배정 계산이 실패합니다.
MAX_SLOTS_PER_TEAM = 10


def list_teams(session: Session) -> list[tuple[Team, int, int]]:
    """팀을 id 오름차순으로, 각 팀의 (전체 포지션 수, 멤버가 배정된 포지션 수)와 함께 반환합니다.

    두 수를 함께 제공하는 것은 화면이 "6개 중 4명"처럼 표시하기 때문입니다. 배정된 멤버 수만
    제공하면 화면이 비어 있는 포지션 개수를 알 수 없습니다.
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
    """팀의 포지션을 포지션·번호 순으로, 그 포지션에 배정된 멤버와 함께 반환합니다.

    빈 포지션도 함께 포함합니다. 화면이 비어 있는 포지션을 표시해야 하므로 제외하면 안 됩니다.
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
    """그 멤버가 배정된 포지션을 팀과 함께 반환합니다."""
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
    """모든 멤버를 번호순으로 반환합니다. 각 멤버가 가진 권한 묶음 이름도 함께 포함됩니다.

    무한 스크롤이므로 페이지 번호가 아니라 "마지막으로 받은 번호 이후"로 이어서 받습니다 —
    조회하는 중에 멤버가 추가되거나 삭제되어도 이미 조회한 행이 다시 나오거나 건너뛰지 않습니다.
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
    """이름으로 멤버를 검색합니다. 포지션에 배정할 멤버를 선택하는 검색 UI가 사용합니다.

    빈 검색어에 전체 목록을 반환하지 않습니다. 명단 전체가 노출되는 endpoint 가 되면 안 됩니다.
    동명이인이 있으므로 결과에는 기수도 포함됩니다(호출자가 표시합니다).
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


def expel_member(session: Session, member_id: int, requester: Member) -> None:
    """member_id 의 계정을 삭제합니다. 추방은 계정 삭제와 같습니다.

    탈퇴(routers/auth.py 의 leave)와 같은 삭제 규칙을 따릅니다. 글·댓글·예약·session 은 함께 삭제되고,
    포지션은 member_id 만 None 이 됩니다(db/models.py 의 ondelete). 자기 자신은 추방할 수 없습니다.
    자기 계정은 탈퇴로만 삭제해야 마지막 헤드매니저가 실수로 사라지지 않습니다.

    모든 항목을 가진 permission set 의 마지막 보유자도 거절합니다. member_expel 만 가진 사람이
    그 보유자를 추방하면 권한을 부여할 사람이 0명이 됩니다.
    """
    if member_id == requester.id:
        raise ValueError("자기 자신은 추방할 수 없습니다")
    member = session.get(Member, member_id)
    if member is None:
        raise ValueError("그런 사람이 없습니다")
    require_another_full_set_holder(session, member_id)
    session.delete(member)
    session.commit()


def require_slot_counts(counts: dict[str, int]) -> dict[Instrument, int]:
    """포지션마다 몇 자리인지를 받아 검증합니다. 0자리인 포지션은 자리를 생성하지 않으므로 제외합니다."""
    checked: dict[Instrument, int] = {}
    for name, count in counts.items():
        if name not in INSTRUMENTS:
            raise ValueError(f"알 수 없는 포지션입니다: {name}")
        if count < 0:
            raise ValueError("포지션 수는 0보다 작을 수 없습니다")
        if count > 0:
            checked[name] = count

    total = sum(checked.values())
    if total == 0:
        raise ValueError("포지션을 하나 이상 선택해 주세요")
    if total > MAX_SLOTS_PER_TEAM:
        raise ValueError(f"한 팀의 포지션은 {MAX_SLOTS_PER_TEAM}개까지입니다")
    return checked


def _get_team_or_raise(session: Session, team_id: int) -> Team:
    team = session.get(Team, team_id)
    if team is None:
        raise ValueError("그런 팀이 없습니다")
    return team


def _get_slot_or_raise(session: Session, team_id: int, slot_id: int) -> TeamSlot:
    slot = session.get(TeamSlot, slot_id)
    # slot_id 만 맞고 팀이 다르면 없는 포지션으로 처리합니다. 다른 팀의 포지션을 번호만으로 수정할 수 없습니다.
    if slot is None or slot.team_id != team_id:
        raise ValueError("그런 포지션이 없습니다")
    return slot


def _require_known_color(color: str) -> str:
    """color 가 TEAM_COLORS 중 하나이면 그대로 반환하고, 아니면 ValueError 를 발생시킵니다."""
    if color not in TEAM_COLORS:
        raise ValueError("알 수 없는 팀 색입니다")
    return color


def create_team(
    session: Session, name: str, counts: dict[str, int], color: str | None = None
) -> Team:
    """팀을 생성하면서 포지션 자리를 함께 생성합니다.

    포지션을 나중에 따로 생성하지 않는 것은, 포지션 없는 팀이 잠깐이라도 저장되면 그 팀이
    배정 계산에서 "멤버가 없는 팀"으로 취급되기 때문입니다. 팀과 포지션은 한 번에 저장됩니다.

    color 가 None 이면 색을 넣지 않고 INSERT 해 DB 트리거가 남은 첫 색을 채우게 합니다. 남은 색이 없으면
    트리거가 teams_color_exhausted 로, 다른 팀이 쓰는 색을 선택하면 unique 제약(teams_color_key)이 거절하고,
    두 거절 모두 ROSTER_MESSAGES 가 문장으로 변경합니다. 저장 전에 남은 색을 세지 않는 것은, 동시에 들어온
    두 요청이 둘 다 통과하기 때문입니다.
    """
    clean_name = require_non_empty(name, "팀 이름")
    checked = require_slot_counts(counts)
    if color is not None:
        _require_known_color(color)

    team = Team(name=clean_name)
    if color is not None:
        team.color = color
    session.add(team)
    # 포지션을 생성하려면 팀의 id가 먼저 필요하므로 flush합니다 — 이름 중복은 이 지점에서 감지됩니다.
    commit_translating(session, ROSTER_MESSAGES, session.flush)
    session.add_all(
        TeamSlot(team_id=team.id, instrument=instrument, ordinal=ordinal)
        for instrument, count in checked.items()
        for ordinal in range(1, count + 1)
    )
    commit_translating(session, ROSTER_MESSAGES)
    return team


def update_team(session: Session, team_id: int, name: str, color: str | None = None) -> Team:
    """팀 이름과 팀 색을 수정합니다. color 가 None 이면 색은 그대로 둡니다. 포지션 구성은 포지션 관련 endpoint가 담당합니다."""
    team = _get_team_or_raise(session, team_id)
    clean_name = require_non_empty(name, "팀 이름")
    # 검증을 전부 통과한 뒤에 대입합니다. 대입이 앞서면 색 검증이 실패해도 이름 변경이 session 에 남습니다.
    checked_color = None if color is None else _require_known_color(color)
    team.name = clean_name
    if checked_color is not None:
        team.color = checked_color
    commit_translating(session, ROSTER_MESSAGES)
    return team


def replace_slots(session: Session, team_id: int, counts: dict[str, int]) -> None:
    """팀의 포지션 구성을 통째로 재구성합니다.

    포지션마다 필요한 자리 수만 받고, 그 수에 맞춰 포지션을 추가하거나 삭제합니다. 기존
    (포지션, 번호)는 그대로 유지하여 그 포지션에 배정된 멤버가 남습니다 — 드럼을 1개에서 2개로
    증가시켰다고 원래 드럼을 연주하던 멤버가 포지션을 잃으면 안 됩니다.

    감소할 때는 번호가 큰 포지션부터 삭제합니다. 삭제되는 포지션에 배정된 멤버는 팀에서 제거됩니다.
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

    stale_ids = [row.id for row in rows if (row.instrument, row.ordinal) not in keep]
    if stale_ids:
        session.execute(delete(TeamSlot).where(TeamSlot.id.in_(stale_ids)))
    session.add_all(
        TeamSlot(team_id=team_id, instrument=instrument, ordinal=ordinal)
        for instrument, ordinal in sorted(keep - have)
    )
    commit_translating(session, ROSTER_MESSAGES)


def delete_team(session: Session, team_id: int) -> None:
    """팀을 삭제합니다. 포지션은 팀의 구성이므로 함께 삭제됩니다.

    포지션에 배정되어 있던 멤버 행은 삭제하지 않습니다.
    """
    team = _get_team_or_raise(session, team_id)
    session.execute(delete(TeamSlot).where(TeamSlot.team_id == team_id))
    session.delete(team)
    commit_translating(session, ROSTER_MESSAGES)


def assign_slot(session: Session, team_id: int, slot_id: int, member_id: int) -> TeamSlot:
    """포지션에 멤버를 배정합니다. 기존에 배정된 멤버가 있으면 그 멤버는 제거됩니다."""
    slot = _get_slot_or_raise(session, team_id, slot_id)
    if session.get(Member, member_id) is None:
        raise ValueError("그런 사람이 없습니다")
    slot.member_id = member_id
    commit_translating(session, ROSTER_MESSAGES)
    return slot


def assign_slot_members(
    session: Session,
    team_id: int,
    wanted: list[tuple[int, int | None]],
    may_seat: bool,
    may_unseat: bool,
    requester_id: int,
) -> None:
    """자리 여러 개의 배정을 transaction 1개로 저장합니다.

    wanted 는 (slot_id, member_id) 목록이고 member_id 가 None 이면 그 자리의 배정을 해제합니다.
    자리마다 따로 저장하면 중간에서 실패했을 때 앞선 자리만 반영된 상태로 끝납니다. 이 함수는
    전부 검증한 뒤 한 번만 commit 하므로 그 상태가 발생하지 않습니다.

    권한은 항목마다 판단합니다. 자리에 사람을 앉히려면 may_seat, 다른 사람을 내리려면 may_unseat
    가 True 여야 합니다. 자신을 내리는 항목은 두 값과 무관하게 통과합니다 — 자리마다 보내는
    DELETE endpoint 와 같은 규칙입니다.

    권한이 없으면 PermissionError, 없는 자리나 없는 사람이면 ValueError 를 발생시킵니다. 두 경우
    모두 session 을 rollback 합니다. rollback 하지 않으면 앞선 항목의 변경이 session 에 남아,
    같은 session 으로 조회하는 코드가 저장되지 않은 값을 읽습니다.
    """
    try:
        slots = [
            (_get_slot_or_raise(session, team_id, slot_id), member_id)
            for slot_id, member_id in wanted
        ]
        for slot, member_id in slots:
            if member_id is None:
                _require_may_unseat(slot, requester_id, may_unseat)
            else:
                _require_may_seat(session, member_id, may_seat)

        # 배정을 전부 해제한 뒤 flush 합니다. (team_id, member_id) unique 제약이 deferrable 이 아니라,
        # 해제와 배정이 같은 flush 에 섞이면 두 사람의 자리를 맞바꿀 때 한쪽이 두 자리를 차지하는
        # 순간이 생겨 DB 가 거절합니다.
        for slot, _ in slots:
            slot.member_id = None
        session.flush()

        for slot, member_id in slots:
            slot.member_id = member_id
    except BaseException:
        session.rollback()
        raise
    commit_translating(session, ROSTER_MESSAGES)


def _require_may_unseat(slot: TeamSlot, requester_id: int, may_unseat: bool) -> None:
    """자리의 배정을 해제할 수 있는지 검증합니다. 자신의 자리는 권한 없이 해제할 수 있습니다."""
    occupied_by_other = slot.member_id is not None and slot.member_id != requester_id
    if occupied_by_other and not may_unseat:
        raise PermissionError("관련된 권한을 가지고 있지 않습니다")


def _require_may_seat(session: Session, member_id: int, may_seat: bool) -> None:
    """자리에 사람을 배정할 수 있는지, 그리고 그 사람이 존재하는지 검증합니다."""
    if not may_seat:
        raise PermissionError("관련된 권한을 가지고 있지 않습니다")
    if session.get(Member, member_id) is None:
        raise ValueError("그런 사람이 없습니다")


def clear_slot(session: Session, team_id: int, slot_id: int) -> TeamSlot:
    """포지션의 멤버 배정을 해제합니다. 포지션 자체는 유지됩니다 — 팀 구성이 변경된 것이 아니라 멤버 배정만 해제됩니다."""
    slot = _get_slot_or_raise(session, team_id, slot_id)
    slot.member_id = None
    commit_translating(session, ROSTER_MESSAGES)
    return slot
