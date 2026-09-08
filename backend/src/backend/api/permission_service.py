from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.input import require_non_empty
from backend.db.models import (
    PERMISSIONS,
    Member,
    MemberPermissionSet,
    PermissionSet,
)
from backend.db.pipeline import commit_translating

# 걸릴 수 있는 제약과 그때 사람에게 보일 문장. 이름은 마이그레이션이 만든 것이다.
SET_MESSAGES = {"permission_sets_name_key": "이미 있는 권한 묶음 이름입니다"}

# 아무도 없는 DB 에 처음 가입한 사람이 받는 permission set 의 이름. 마이그레이션이
# 심는 permission set 도 같은 이름을 쓴다(migrations/versions/b7f1a92c4d31_permission_sets.py).
FULL_SET_NAME = "헤드매니저"
FULL_SET_NOTE = "모든 권한을 가진 멤버입니다"


def _clean_permissions(names: list[str]) -> list[str]:
    """모르는 이름을 거절하고, 중복을 없앤 뒤 선언 순서로 정렬해 돌려준다."""
    unknown = [name for name in names if name not in PERMISSIONS]
    if unknown:
        raise ValueError("알 수 없는 권한 항목이 있습니다")
    chosen = set(names)
    return [name for name in PERMISSIONS if name in chosen]


def _get_set_or_raise(session: Session, set_id: int) -> PermissionSet:
    permission_set = session.get(PermissionSet, set_id)
    if permission_set is None:
        raise ValueError("그런 권한 묶음이 없습니다")
    return permission_set


def account_permissions(session: Session, member_id: int) -> list[str]:
    """member_id 가 가진 모든 permission set 의 항목을 합집합으로 모아 선언 순서로 돌려준다.

    permission set 이 하나도 없으면 빈 목록이다 — 아무것도 할 수 없다는 뜻이다.
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


def list_permission_sets(session: Session) -> list[tuple[PermissionSet, list[int]]]:
    """permission set 을 id 오름차순으로, 그 permission set 을 가진 사람 번호와 함께 돌려준다."""
    holders: dict[int, list[int]] = {}
    rows = session.execute(
        select(MemberPermissionSet.permission_set_id, MemberPermissionSet.member_id)
        .order_by(MemberPermissionSet.member_id)
    ).all()
    for set_id, member_id in rows:
        holders.setdefault(set_id, []).append(member_id)

    sets = session.scalars(select(PermissionSet).order_by(PermissionSet.id)).all()
    return [(row, holders.get(row.id, [])) for row in sets]


def set_holders(session: Session, set_id: int) -> list[int]:
    """set_id permission set 을 가진 사람 번호를 오름차순으로 돌려준다."""
    return list(
        session.scalars(
            select(MemberPermissionSet.member_id)
            .where(MemberPermissionSet.permission_set_id == set_id)
            .order_by(MemberPermissionSet.member_id)
        ).all()
    )


def create_permission_set(
    session: Session, name: str, description: str, permissions: list[str]
) -> PermissionSet:
    """name 으로 permission set 을 새로 만든다. 빈 이름과 이미 있는 이름을 거절한다."""
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
    """set_id permission set 의 이름과 켜진 항목을 통째로 갈아 끼운다."""
    permission_set = _get_set_or_raise(session, set_id)
    permission_set.name = require_non_empty(name, "이름")
    permission_set.description = require_non_empty(description, "설명")
    permission_set.permissions = _clean_permissions(permissions)
    commit_translating(session, SET_MESSAGES)
    return permission_set


def delete_permission_set(session: Session, set_id: int) -> None:
    """set_id permission set 을 지운다. 그 permission set 을 가졌던 사람의 연결도 함께 사라진다
    (member_permission_sets.permission_set_id 가 ON DELETE CASCADE)."""
    session.delete(_get_set_or_raise(session, set_id))
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
    """member_id 에게 set_id permission set 을 붙인다. 이미 가지고 있으면 그대로 둔다."""
    if session.get(Member, member_id) is None:
        raise ValueError("그런 사람이 없습니다")
    _get_set_or_raise(session, set_id)

    if _find_grant(session, member_id, set_id) is not None:
        return
    session.add(
        MemberPermissionSet(member_id=member_id, permission_set_id=set_id)
    )
    session.commit()


def revoke_permission_set(session: Session, member_id: int, set_id: int) -> None:
    """member_id 에게서 set_id permission set 을 뗀다. 가지고 있지 않으면 거절한다."""
    grant = _find_grant(session, member_id, set_id)
    if grant is None:
        raise ValueError("그 권한 묶음을 가지고 있지 않습니다")
    session.delete(grant)
    session.commit()


def grant_full_permissions(session: Session, member_id: int) -> None:
    """member_id 에게 열한 가지가 전부 켜진 permission set 을 붙인다. 그런 permission set 이 없으면 만든다.

    커밋은 부르는 쪽이 한다 — 가입은 계정·포지션·권한을 한 번에 커밋한다.
    """
    full = session.scalars(
        select(PermissionSet)
        .where(PermissionSet.permissions.contains(list(PERMISSIONS)))
        .order_by(PermissionSet.id)
        .limit(1)
    ).first()
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
