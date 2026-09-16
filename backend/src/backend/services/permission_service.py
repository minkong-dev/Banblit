from typing import NamedTuple

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from backend.services.input import require_non_empty
from backend.db.models import (
    PERMISSIONS,
    Member,
    MemberPermissionSet,
    PermissionSet,
)
from backend.db.pipeline import commit_translating

# 위반될 수 있는 제약 조건과 그때 사용자에게 표시할 문장입니다. 제약 조건 이름은 migration(DB 구조를 바꾸는 단계별 기록)이 정한 이름입니다.
SET_MESSAGES = {"permission_sets_name_key": "이미 있는 권한 묶음 이름입니다"}

# 계정이 0개인 DB 에 처음 가입한 사람이 받는 permission set 의 이름입니다. migration 이
# 추가하는 permission set 도 같은 이름을 사용합니다(migrations/versions/b7f1a92c4d31_permission_sets.py).
FULL_SET_NAME = "헤드매니저"
FULL_SET_NOTE = "최고 권한 관리자"


def _clean_permissions(names: list[str]) -> list[str]:
    """알 수 없는 이름을 거부하고, 중복을 제거한 뒤 선언 순서로 정렬하여 반환합니다."""
    unknown = [name for name in names if name not in PERMISSIONS]
    if unknown:
        raise ValueError("오류로 인해 해당 권한은 사용할 수 없어요.")
    chosen = set(names)
    return [name for name in PERMISSIONS if name in chosen]


def _get_set_or_raise(session: Session, set_id: int) -> PermissionSet:
    permission_set = session.get(PermissionSet, set_id)
    if permission_set is None:
        raise ValueError("해당 권한이 존재하지 않아요.")
    return permission_set


def account_permission_set_names(session: Session, member_id: int) -> list[str]:
    """member_id 가 가진 permission set 의 이름을 id 오름차순으로 반환합니다. 화면이 역할 이름 대신 이 이름을 표시합니다."""
    return list(
        session.scalars(
            select(PermissionSet.name)
            .join(
                MemberPermissionSet,
                MemberPermissionSet.permission_set_id == PermissionSet.id,
            )
            .where(MemberPermissionSet.member_id == member_id)
            .order_by(PermissionSet.id)
        ).all()
    )


def _is_full(permissions: list[str]) -> bool:
    return set(PERMISSIONS) <= set(permissions)


def _full_set_ids() -> Select[tuple[int]]:
    """모든 항목이 활성화된 permission set 의 번호를 고르는 질의입니다. 실행하지 않고 질의만 반환하므로
    호출자가 order_by·with_for_update·limit 을 덧붙입니다. 판정 기준이 PERMISSIONS 한 곳에만 남습니다."""
    return select(PermissionSet.id).where(
        PermissionSet.permissions.contains(list(PERMISSIONS))
    )


def _require_another_full_set(session: Session, set_id: int) -> None:
    """set_id 외에 모든 항목이 활성화된 permission set 이 없으면 ValueError 를 발생시킵니다.

    기준은 개인이 아니라 permission set 입니다(사용자 결정 2026-09-11). 모든 항목을 가진 permission set 이
    0개가 되면 권한을 부여할 사람이 없어지므로, 마지막 1개는 삭제와 항목 비활성화를 거부합니다.

    모든 항목을 가진 행을 전부 잠급니다(with_for_update). 잠그지 않으면 2개가 남은 상태에서 두 요청이
    각각 하나씩 동시에 삭제할 때 둘 다 "다른 하나가 있다" 로 통과해 0개가 됩니다. 뒤에 온 요청은
    앞의 요청이 commit 할 때까지 기다렸다가 다시 세므로 마지막 1개에서 거부됩니다. 검사 대상인
    set_id 도 full set 이라 함께 잠기고, id 오름차순으로 잠가 두 요청이 서로를 기다리지 않게 합니다.
    """
    full_ids = session.scalars(
        _full_set_ids().order_by(PermissionSet.id).with_for_update()
    ).all()
    another = next((full_id for full_id in full_ids if full_id != set_id), None)
    if another is None:
        raise ValueError("모든 권한을 가진 마지막 permission set 은 삭제하거나 항목을 끌 수 없습니다")


def require_another_full_set_holder(
    session: Session, member_id: int, set_id: int | None = None
) -> None:
    """member_id 가 모든 항목을 가진 permission set 의 유일한 보유자이면 ValueError 를 발생시킵니다.

    set_id 를 주면 그 permission set 하나만 잃는 경우로 셉니다(권한 회수). member_id 가 다른 full set 을
    또 가지고 있으면 통과합니다. 주지 않으면 보유를 전부 잃는 경우로 셉니다(추방).

    _require_another_full_set 은 permission set 이 남는지만 확인합니다. 추방과 회수는 permission set 을
    남기고 가진 사람만 0명으로 만들 수 있어 검사가 따로 필요합니다.

    보유 행(member_permission_sets)을 계정 번호 오름차순으로 잠급니다. 마지막 보유자가 2명 남은 상태에서
    두 요청이 각각 1명씩 동시에 처리하면 둘 다 "다른 1명이 있다" 로 통과해 0명이 됩니다. 잠그는 table 이
    _require_another_full_set(permission_sets)과 달라 두 검사는 서로 경합하지 않습니다.
    """
    rows = session.execute(
        select(MemberPermissionSet.member_id, MemberPermissionSet.permission_set_id)
        .where(MemberPermissionSet.permission_set_id.in_(_full_set_ids()))
        .order_by(MemberPermissionSet.member_id)
        .with_for_update()
    ).all()
    remaining = [
        holder
        for holder, held in rows
        if holder != member_id or (set_id is not None and held != set_id)
    ]
    if not remaining:
        raise ValueError(
            "모든 권한을 가진 permission set 의 마지막 보유자입니다. "
            "다른 사람에게 먼저 부여해 주세요"
        )


def account_permissions(session: Session, member_id: int) -> list[str]:
    """member_id가 가진 모든 permission set의 항목을 합집합으로 모아 선언 순서로 반환합니다.

    permission set 이 하나도 없으면 빈 목록을 반환합니다. 그 멤버는 권한이 필요한 동작을 할 수 없습니다.
    """
    rows = session.scalars(
        select(PermissionSet.permissions)
        .join(
            MemberPermissionSet,
            MemberPermissionSet.permission_set_id == PermissionSet.id,
        )
        .where(MemberPermissionSet.member_id == member_id)
    ).all()
    granted: set[str] = set()
    for row in rows:
        granted.update(row)
    return [name for name in PERMISSIONS if name in granted]


class SetMember(NamedTuple):
    """permission set을 가진 멤버입니다. 번호와 이름을 함께 포함합니다.

    이름을 포함하는 이유는 화면이 번호를 이름으로 변환하지 않게 하기 위해서입니다. 화면은
    멤버 목록을 페이지 단위로 받으므로, 아직 받지 않은 페이지에 있는 멤버는 이름을 찾지 못합니다.
    """

    id: int
    name: str


def list_permission_sets(session: Session) -> list[tuple[PermissionSet, list[SetMember]]]:
    """permission set을 id 오름차순으로, 그 permission set을 가진 멤버와 함께 반환합니다."""
    holders: dict[int, list[SetMember]] = {}
    rows = session.execute(
        select(MemberPermissionSet.permission_set_id, Member.id, Member.name)
        .join(Member, Member.id == MemberPermissionSet.member_id)
        .order_by(Member.id)
    ).all()
    for set_id, member_id, name in rows:
        holders.setdefault(set_id, []).append(SetMember(member_id, name))

    sets = session.scalars(select(PermissionSet).order_by(PermissionSet.id)).all()
    return [(row, holders.get(row.id, [])) for row in sets]


def set_holders(session: Session, set_id: int) -> list[SetMember]:
    """set_id permission set을 가진 멤버를 번호 오름차순으로 반환합니다."""
    rows = session.execute(
        select(Member.id, Member.name)
        .join(MemberPermissionSet, MemberPermissionSet.member_id == Member.id)
        .where(MemberPermissionSet.permission_set_id == set_id)
        .order_by(Member.id)
    ).all()
    return [SetMember(member_id, name) for member_id, name in rows]


def create_permission_set(
    session: Session, name: str, description: str, permissions: list[str]
) -> PermissionSet:
    """name으로 permission set을 새로 생성합니다. 빈 이름과 이미 있는 이름을 거부합니다."""
    permission_set = PermissionSet(
        name=require_non_empty(name, "이름"),
        description=require_non_empty(description, "설명"),
        permissions=_clean_permissions(permissions),
    )
    session.add(permission_set)
    commit_translating(session, SET_MESSAGES)
    return permission_set


def update_permission_set(
    session: Session, set_id: int, name: str, description: str, permissions: list[str]
) -> PermissionSet:
    """set_id permission set 의 이름·설명·활성화된 항목을 통째로 교체합니다. 모든 항목을 가진 마지막 permission set 의 항목은 끌 수 없습니다."""
    permission_set = _get_set_or_raise(session, set_id)
    cleaned = _clean_permissions(permissions)
    if _is_full(permission_set.permissions) and not _is_full(cleaned):
        _require_another_full_set(session, set_id)
    permission_set.name = require_non_empty(name, "이름")
    permission_set.description = require_non_empty(description, "설명")
    permission_set.permissions = cleaned
    commit_translating(session, SET_MESSAGES)
    return permission_set


def delete_permission_set(session: Session, set_id: int) -> None:
    """set_id permission set 을 삭제합니다. 그 permission set 을 가졌던 멤버의 연결도 함께 삭제됩니다
    (member_permission_sets.permission_set_id 가 ON DELETE CASCADE 제약). 모든 항목을 가진 마지막 permission set 은 삭제할 수 없습니다."""
    permission_set = _get_set_or_raise(session, set_id)
    if _is_full(permission_set.permissions):
        _require_another_full_set(session, set_id)
    session.delete(permission_set)
    session.commit()


def _find_grant(
    session: Session, member_id: int, set_id: int
) -> MemberPermissionSet | None:
    return session.scalar(
        select(MemberPermissionSet).where(
            MemberPermissionSet.member_id == member_id,
            MemberPermissionSet.permission_set_id == set_id,
        )
    )


def grant_permission_set(session: Session, member_id: int, set_id: int) -> None:
    """member_id에게 set_id permission set을 부여합니다. 이미 가지고 있으면 그대로 둡니다."""
    if session.get(Member, member_id) is None:
        raise ValueError("해당 멤버가 존재하지 않아요.")
    _get_set_or_raise(session, set_id)

    if _find_grant(session, member_id, set_id) is not None:
        return
    session.add(
        MemberPermissionSet(member_id=member_id, permission_set_id=set_id)
    )
    session.commit()


def revoke_permission_set(
    session: Session, member_id: int, set_id: int, requester_id: int
) -> None:
    """member_id에게서 set_id permission set을 철회합니다. 가지고 있지 않으면 거부합니다.

    남의 것을 회수할 때만 모든 항목을 가진 permission set 의 마지막 보유자인지 확인합니다.
    permission_grant 항목만 가진 사람이 마지막 보유자에게서 회수하면 권한을 부여할 사람이 0명이 됩니다.
    자기 자신에게서 permission set 을 회수하는 요청(member_id 와 requester_id 가 같은 요청)은
    본인의 결정이라 확인하지 않습니다(사용자 결정 2026-09-11). 권한 이전의
    마지막 단계가 그 경로이고, 그 시점에는 다음 사람이 이미 받았으므로 보유자가 0명이 되지 않습니다.
    """
    grant = _find_grant(session, member_id, set_id)
    if grant is None:
        raise ValueError("해당 권한을 가지고 있지 않아요.")
    if member_id != requester_id:
        require_another_full_set_holder(session, member_id, set_id)
    session.delete(grant)
    session.commit()


def grant_full_permissions(session: Session, member_id: int) -> None:
    """member_id에게 18가지 항목이 모두 활성화된 permission set을 부여합니다. 그런 permission set이 없으면 생성합니다.

    commit 은 호출자가 수행합니다. 가입은 계정과 권한을 한 번에 commit 합니다.
    """
    full_id = session.scalars(
        _full_set_ids().order_by(PermissionSet.id).limit(1)
    ).first()
    full = None if full_id is None else session.get(PermissionSet, full_id)
    if full is None:
        full = PermissionSet(
            name=FULL_SET_NAME,
            description=FULL_SET_NOTE,
            permissions=list(PERMISSIONS),
        )
        session.add(full)
        session.flush()
    session.add(
        MemberPermissionSet(member_id=member_id, permission_set_id=full.id)
    )
