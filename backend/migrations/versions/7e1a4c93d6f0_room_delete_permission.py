"""권한 항목에 room_delete 를 추가합니다.

합주실 삭제 기능에 필요한 항목입니다. permission_sets.permissions 에 허용된 이름은 CHECK 제약이
정하므로, 항목을 추가하려면 제약을 다시 생성해야 합니다.

**모든 항목을 가진 permission set 에 room_delete 를 함께 추가합니다.** 추가하지 않으면 그 set 이
"모든 항목을 가진 set" 판정(services/permission_service.py 의 _is_full)에서 빠집니다. 그 결과
헤드매니저가 권한을 부여할 수 없게 되고, 마지막 full set 을 지키는 검사도 대상이 0개가 됩니다.

Revision ID: 7e1a4c93d6f0
Revises: 3c9d41b7e2a5
Create Date: 2026-09-19
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "7e1a4c93d6f0"
down_revision: Union[str, Sequence[str], None] = "3c9d41b7e2a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "permission_sets_permissions_valid"

_BEFORE = (
    "room_create", "room_edit", "period_create", "period_edit", "period_delete",
    "team_create", "team_edit", "team_delete", "member_add", "member_remove",
    "member_expel", "notice_write", "board_moderate", "reservation_manage",
    "assign_run", "assign_read", "proposal_confirm", "rollback",
    "permission_manage", "permission_grant",
)
_AFTER = (*_BEFORE[:2], "room_delete", *_BEFORE[2:])


def _array(names: Sequence[str]) -> str:
    return "ARRAY[{}]::text[]".format(", ".join(f"'{name}'" for name in names))


def _swap_constraint(allowed: Sequence[str]) -> None:
    op.drop_constraint(_CONSTRAINT, "permission_sets", type_="check")
    op.create_check_constraint(
        _CONSTRAINT, "permission_sets", f"permissions <@ {_array(allowed)}"
    )


def upgrade() -> None:
    _swap_constraint(_AFTER)
    op.execute(
        "UPDATE permission_sets"
        " SET permissions = permissions || ARRAY['room_delete']::text[]"
        f" WHERE permissions @> {_array(_BEFORE)}"
        "   AND NOT permissions @> ARRAY['room_delete']::text[]"
    )


def downgrade() -> None:
    # 제약을 되돌리기 전에 값을 먼저 제거합니다. 순서를 바꾸면 room_delete 를 가진 행이 남아 있어
    # 제약 생성이 실패합니다.
    op.execute(
        "UPDATE permission_sets"
        " SET permissions = array_remove(permissions, 'room_delete')"
    )
    _swap_constraint(_BEFORE)
