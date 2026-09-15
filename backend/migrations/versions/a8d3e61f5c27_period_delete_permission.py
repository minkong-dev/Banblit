"""권한 항목 "집중합주 기간 삭제"(period_delete)를 추가합니다.

기간은 추가·수정만 되고 삭제할 방법이 없었습니다(patch_note 13번). 기간을 삭제하면 그 기간의 배정 결과·
계산 기록·이전 배정기록이 외래 키 CASCADE 로 함께 삭제되므로, 수정과 다른 항목으로 둡니다.
기존 항목 19개를 전부 가진 permission set(권한 집합)에만 새 항목을 추가합니다. 그 permission set 은
"할 수 있는 일 전부"라는 의미이기 때문입니다(e5b7c2a94d18 과 같은 규칙).

Revision ID: a8d3e61f5c27
Revises: f4c2a9d17b63
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "a8d3e61f5c27"
down_revision: Union[str, Sequence[str], None] = "f4c2a9d17b63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "permission_sets_permissions_valid"

# 이 시점의 권한 항목입니다. migration 은 지나간 시점을 그대로 재현해야 하므로
# db/models.py 의 Permission 을 참조하지 않고 이 파일에 정의합니다.
OLD = (
    "room_create", "room_edit", "period_create", "period_edit",
    "team_create", "team_edit", "team_delete", "member_add", "member_remove", "member_expel",
    "notice_write", "board_moderate", "reservation_manage",
    "assign_run", "assign_read", "proposal_confirm", "rollback",
    "permission_manage", "permission_grant",
)
ADDED = ("period_delete",)
NEW = OLD + ADDED


def _array(names: Sequence[str]) -> str:
    return "ARRAY[{}]::text[]".format(", ".join(f"'{name}'" for name in names))


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT, "permission_sets", type_="check")
    op.execute(
        "UPDATE permission_sets"
        f" SET permissions = permissions || {_array(ADDED)}"
        f" WHERE permissions @> {_array(OLD)}"
    )
    op.create_check_constraint(
        CONSTRAINT, "permission_sets", f"permissions <@ {_array(NEW)}"
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, "permission_sets", type_="check")
    op.execute(
        "UPDATE permission_sets SET permissions = ("
        "  SELECT COALESCE(array_agg(name), ARRAY[]::text[])"
        "  FROM unnest(permissions) AS name"
        f"  WHERE name <> ALL({_array(ADDED)})"
        ")"
    )
    op.create_check_constraint(
        CONSTRAINT, "permission_sets", f"permissions <@ {_array(OLD)}"
    )
