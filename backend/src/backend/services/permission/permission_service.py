from collections import defaultdict
from collections.abc import Collection
from typing import NamedTuple

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from backend.services.validation.pipeline import require_non_empty
from backend.contract import PERMISSIONS
from backend.db.models import (
    Member,
    MemberPermissionSet,
    PermissionSet,
)
from backend.db.pipeline import commit_translating

# 위반될 수 있는 제약 조건과 그때 사용자에게 표시할 문장입니다. 제약 조건 이름은 migration(DB 구조를 변경하는 단계별 기록)이 지정한 이름입니다.
SET_MESSAGES = {"permission_sets_name_key": "이미 있는 권한 세트 이름이에요"}

# 가입할 때 admin_code 가 환경변수의 코드와 같은 사람이 받는 permission set 의 이름입니다. migration 이
# 추가하는 permission set 도 같은 이름을 사용합니다(migrations/versions/080a74e46f56_initial_schema.py).
FULL_SET_NAME = "헤드매니저"
FULL_SET_NOTE = "최고 권한 관리자"


def _clean_permissions(names: list[str]) -> list[str]:
    """알 수 없는 이름을 거부하고, 중복을 제거한 뒤 선언 순서로 정렬하여 반환합니다."""
    unknown = [name for name in names if name not in PERMISSIONS]
    if unknown:
        raise ValueError("존재하지 않는 권한이에요.")
    chosen = set(names)
    return [name for name in PERMISSIONS if name in chosen]


def _get_set_or_raise(session: Session, set_id: int) -> PermissionSet:
    permission_set = session.get(PermissionSet, set_id)
    if permission_set is None:
        raise ValueError("존재하지 않는 권한 세트예요.")
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


def holds_every_permission(permissions: Collection[str]) -> bool:
    return set(PERMISSIONS) <= set(permissions)


def _full_set_ids() -> Select[tuple[int]]:
    """모든 항목이 활성화된 permission set 의 번호를 선택하는 질의입니다. 실행하지 않고 질의만 반환하므로
    호출자가 order_by, with_for_update, limit 을 추가합니다."""
    return select(PermissionSet.id).where(
        PermissionSet.permissions.contains(list(PERMISSIONS))
    )


def _require_another_full_set(session: Session, set_id: int) -> None:
    """set_id 외에 모든 항목이 활성화된 permission set 이 존재하지 않으면 ValueError 를 발생시킵니다.

    마지막 1개는 삭제와 항목 비활성화를 거부합니다.

    모든 항목을 가진 행을 id 오름차순으로 잠급니다(with_for_update).
    """
    full_ids = session.scalars(
        _full_set_ids().order_by(PermissionSet.id).with_for_update()
    ).all()
    another = next((full_id for full_id in full_ids if full_id != set_id), None)
    if another is None:
        raise ValueError("모든 권한을 가진 마지막 permission set 은 삭제하거나 항목을 끌 수 없어요")


def require_another_full_set_holder(
    session: Session, member_id: int, set_id: int | None = None
) -> None:
    """member_id 가 모든 항목을 가진 permission set 의 유일한 보유자이면 ValueError 를 발생시킵니다.

    set_id 를 주면 그 permission set 하나만 잃는 경우로 셉니다(권한 회수). member_id 가 다른 full set 을
    보유하면 통과합니다. 주지 않으면 보유를 전부 잃는 경우로 셉니다(추방).

    보유 행(member_permission_sets)을 계정 번호 오름차순으로 잠급니다.
    """
    rows = session.execute(
        select(MemberPermissionSet.member_id, MemberPermissionSet.permission_set_id)
        .where(MemberPermissionSet.permission_set_id.in_(_full_set_ids()))
        .order_by(MemberPermissionSet.member_id)
        .with_for_update()
    ).all()
    # 회수 뒤에도 전체 권한을 가진 보유 기록입니다. 다른 멤버의 기록은 남고, 같은 멤버의 기록은
    # set_id 1개만 회수할 때 그 밖의 set 이 남습니다. set_id 가 None 이면 그 멤버의 기록은 전부 사라집니다.
    remaining: list[int] = []
    for holder, held in rows:
        if holder != member_id:
            remaining.append(holder)
        elif set_id is not None and held != set_id:
            remaining.append(holder)
    if not remaining:
        raise ValueError(
            "모든 권한을 가진 permission set 의 마지막 보유자예요. "
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
    """permission set을 가진 멤버의 번호와 이름입니다."""

    id: int
    name: str


def list_permission_sets(session: Session) -> list[tuple[PermissionSet, list[SetMember]]]:
    """permission set을 id 오름차순으로, 그 permission set을 가진 멤버와 함께 반환합니다."""
    holders: dict[int, list[SetMember]] = defaultdict(list)
    rows = session.execute(
        select(MemberPermissionSet.permission_set_id, Member.id, Member.name)
        .join(Member, Member.id == MemberPermissionSet.member_id)
        .order_by(Member.id)
    ).all()
    for set_id, member_id, name in rows:
        holders[set_id].append(SetMember(member_id, name))

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
    """set_id permission set 의 이름, 설명, 활성화된 항목을 전부 교체합니다. 모든 항목을 가진 마지막 permission set 의 항목은 끌 수 없습니다."""
    permission_set = _get_set_or_raise(session, set_id)
    cleaned = _clean_permissions(permissions)
    if holds_every_permission(permission_set.permissions) and not holds_every_permission(cleaned):
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
    if holds_every_permission(permission_set.permissions):
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
    본인의 결정이라 확인하지 않습니다. 권한 이전의
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
    """member_id에게 권한 항목(Permission) 전부가 활성화된 permission set을 부여합니다. 그런 permission set이 없으면 생성합니다.

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
