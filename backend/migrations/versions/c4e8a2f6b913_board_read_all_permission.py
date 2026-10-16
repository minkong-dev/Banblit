"""권한 항목에 board_read_all 을 추가합니다.

소속되지 않은 팀의 팀 게시판을 조회하는 항목입니다(사용자 결정 2026-10-16). 모든 항목을 가진 permission set 에도
추가합니다. 추가하지 않으면 그 set 이 _is_full(services/permission/permission_service.py) 판정에서 빠집니다.

Revision ID: c4e8a2f6b913
Revises: b5d2e9f17a03
Create Date: 2026-10-16
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "c4e8a2f6b913"
down_revision: Union[str, Sequence[str], None] = "b5d2e9f17a03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "permission_sets_permissions_valid"

_BEFORE = (
    "room_create", "room_edit", "room_delete", "period_create", "period_edit",
    "period_delete", "team_create", "team_edit", "team_delete", "member_add",
    "member_remove", "member_expel", "notice_write", "board_moderate",
    "reservation_manage", "unavailable_read", "unavailable_manage",
    "assign_run", "assign_read", "proposal_confirm", "permission_manage", "permission_grant",
)
_ADDED = "board_read_all"
# board_moderate 바로 뒤입니다. 순서는 contract.py 의 Permission 선언과 같아야 합니다.
_AFTER = (*_BEFORE[:14], _ADDED, *_BEFORE[14:])


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
        f" SET permissions = permissions || ARRAY['{_ADDED}']::text[]"
        f" WHERE permissions @> {_array(_BEFORE)}"
    )


def downgrade() -> None:
    # 값을 먼저 제거합니다. 남아 있으면 제약 생성이 실패합니다.
    op.execute(f"UPDATE permission_sets SET permissions = array_remove(permissions, '{_ADDED}')")
    _swap_constraint(_BEFORE)
