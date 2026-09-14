"""권한 항목 "멤버 추방"(member_expel)을 추가합니다.

추방은 계정 삭제입니다(사용자 결정 2026-09-14). 탈퇴와 같은 삭제 규칙을 따르므로 글·댓글·예약도
함께 삭제되고, 포지션은 비워집니다. 기존 항목 18개를 전부 가진 permission set(권한 집합)에만
새 항목을 추가합니다. 그 permission set 은 "할 수 있는 일 전부"라는 의미이기 때문입니다.

Revision ID: e5b7c2a94d18
Revises: a92c7f0d3b51
Create Date: 2026-09-14
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "e5b7c2a94d18"
down_revision: Union[str, Sequence[str], None] = "a92c7f0d3b51"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "permission_sets_permissions_valid"

# 이 시점의 권한 항목입니다. migration 은 지나간 시점을 그대로 재현해야 하므로
# db/models.py 의 Permission 을 참조하지 않고 이 파일에 정의합니다.
OLD = (
    "room_create", "room_edit", "period_create", "period_edit",
    "team_create", "team_edit", "team_delete", "member_add", "member_remove",
    "notice_write", "board_moderate", "reservation_manage",
    "assign_run", "assign_read", "proposal_confirm", "rollback",
    "permission_manage", "permission_grant",
)
ADDED = ("member_expel",)
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
