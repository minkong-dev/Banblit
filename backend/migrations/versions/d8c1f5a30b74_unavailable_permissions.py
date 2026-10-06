"""권한 항목에 unavailable_read 와 unavailable_manage 를 추가합니다.

다른 멤버의 불가능 일정을 조회하는 항목과, 사유를 담은 알림과 함께 삭제(반려)하는 항목입니다.
permission_sets.permissions 에 허용된 이름은 CHECK 제약이 정하므로, 항목을 추가하려면 제약을 다시
생성해야 합니다.

**모든 항목을 가진 permission set 에 두 항목을 함께 추가합니다.** 추가하지 않으면 그 set 이
"모든 항목을 가진 set" 판정(services/permission/permission_service.py 의 _is_full)에서 빠집니다. 그 결과
헤드매니저가 권한을 부여할 수 없게 되고, 마지막 full set 을 지키는 검사도 대상이 0개가 됩니다.

Revision ID: d8c1f5a30b74
Revises: 5c3e8d1a7f20
Create Date: 2026-10-05
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "d8c1f5a30b74"
down_revision: Union[str, Sequence[str], None] = "5c3e8d1a7f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "permission_sets_permissions_valid"

_BEFORE = (
    "room_create", "room_edit", "room_delete", "period_create", "period_edit",
    "period_delete", "team_create", "team_edit", "team_delete", "member_add",
    "member_remove", "member_expel", "notice_write", "board_moderate",
    "reservation_manage", "assign_run", "assign_read", "proposal_confirm",
    "rollback", "permission_manage", "permission_grant",
)
_ADDED = ("unavailable_read", "unavailable_manage")
# reservation_manage 바로 뒤입니다. 순서는 db/models.py 의 Permission 선언과 같아야 합니다.
_AFTER = (*_BEFORE[:15], *_ADDED, *_BEFORE[15:])


def _array(names: Sequence[str]) -> str:
    return "ARRAY[{}]::text[]".format(", ".join(f"'{name}'" for name in names))


def _swap_constraint(allowed: Sequence[str]) -> None:
    op.drop_constraint(_CONSTRAINT, "permission_sets", type_="check")
    op.create_check_constraint(
        _CONSTRAINT, "permission_sets", f"permissions <@ {_array(allowed)}"
    )


def upgrade() -> None:
    _swap_constraint(_AFTER)
    for name in _ADDED:
        op.execute(
            "UPDATE permission_sets"
            f" SET permissions = permissions || ARRAY['{name}']::text[]"
            f" WHERE permissions @> {_array(_BEFORE)}"
            f"   AND NOT permissions @> ARRAY['{name}']::text[]"
        )


def downgrade() -> None:
    # 제약을 되돌리기 전에 값을 먼저 제거합니다. 순서를 바꾸면 새 항목을 가진 행이 남아 있어
    # 제약 생성이 실패합니다.
    for name in _ADDED:
        op.execute(
            "UPDATE permission_sets"
            f" SET permissions = array_remove(permissions, '{name}')"
        )
    _swap_constraint(_BEFORE)
