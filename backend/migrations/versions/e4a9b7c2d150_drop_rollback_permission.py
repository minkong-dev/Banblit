"""권한 항목에서 rollback 을 삭제합니다.

되돌리기 기능이 삭제되어(사용자 결정 2026-10-13) 어느 endpoint 도 이 항목을 검사하지 않습니다. 스케줄링 기록 조회와
적용은 proposal_confirm 이 담당합니다. permission_sets.permissions 에 허용된 이름은 CHECK 제약이 정하므로,
값을 먼저 제거한 뒤 제약을 다시 생성합니다.

**downgrade 는 모든 항목을 가진 permission set 에만 rollback 을 다시 추가합니다.** 추가하지 않으면 그 set 이
"모든 항목을 가진 set" 판정(services/permission/permission_service.py 의 _is_full)에서 빠집니다.

Revision ID: e4a9b7c2d150
Revises: c7d2e5a18f40
Create Date: 2026-10-13
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "e4a9b7c2d150"
down_revision: Union[str, Sequence[str], None] = "c7d2e5a18f40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "permission_sets_permissions_valid"

# 순서는 db/models.py 의 Permission 선언과 같아야 합니다.
_AFTER = (
    "room_create", "room_edit", "room_delete", "period_create", "period_edit",
    "period_delete", "team_create", "team_edit", "team_delete", "member_add",
    "member_remove", "member_expel", "notice_write", "board_moderate",
    "reservation_manage", "unavailable_read", "unavailable_manage",
    "assign_run", "assign_read", "proposal_confirm", "permission_manage", "permission_grant",
)
_REMOVED = "rollback"
# proposal_confirm 바로 뒤입니다.
_BEFORE = (*_AFTER[:20], _REMOVED, *_AFTER[20:])


def _array(names: Sequence[str]) -> str:
    return "ARRAY[{}]::text[]".format(", ".join(f"'{name}'" for name in names))


def _swap_constraint(allowed: Sequence[str]) -> None:
    op.drop_constraint(_CONSTRAINT, "permission_sets", type_="check")
    op.create_check_constraint(
        _CONSTRAINT, "permission_sets", f"permissions <@ {_array(allowed)}"
    )


def upgrade() -> None:
    op.execute(f"UPDATE permission_sets SET permissions = array_remove(permissions, '{_REMOVED}')")
    _swap_constraint(_AFTER)


def downgrade() -> None:
    _swap_constraint(_BEFORE)
    op.execute(
        "UPDATE permission_sets"
        f" SET permissions = permissions || ARRAY['{_REMOVED}']::text[]"
        f" WHERE permissions @> {_array(_AFTER)}"
    )
