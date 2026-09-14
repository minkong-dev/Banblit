"""권한 항목을 동작 단위로 나눕니다.

생성·수정·삭제·부여가 한 항목에 묶여 있어서, permission set(권한 집합)을 정의하는 사람이 "팀을
생성할 수는 있지만 삭제할 수는 없는" permission set 을 만들 수 없었습니다. 각 동작마다
권한 항목을 따로 나눕니다.

삭제된 항목도 함께 정리합니다. join_approve 는 참가 신청 기능이 없어지면서 사용할
대상이 없어졌는데 목록에는 남아 있었습니다.

Revision ID: c1d5e83f4a29
Revises: b2d94f7a1c05
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c1d5e83f4a29"
down_revision: Union[str, Sequence[str], None] = "b2d94f7a1c05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "permission_sets_permissions_valid"

OLD = (
    "room_manage", "period_manage", "team_manage", "member_remove", "join_approve",
    "assign_run", "assign_read", "proposal_confirm", "rollback", "notice_write",
    "permission_grant",
)

NEW = (
    "room_create", "room_edit", "period_create", "period_edit",
    "team_create", "team_edit", "team_delete", "member_add", "member_remove",
    "notice_write", "board_moderate", "reservation_manage",
    "assign_run", "assign_read", "proposal_confirm", "rollback",
    "permission_manage", "permission_grant",
)

# 이미 저장된 permission set 을 이행하는 mapping 입니다. 옛 항목이 활성화되어 있으면
# 나뉜 항목을 전부 활성화합니다. 이행 전에 그 동작을 할 수 있던 사람이 이행 후에
# 할 수 없게 되면 안 되기 때문입니다.
SPLIT = {
    "room_manage": ("room_create", "room_edit"),
    "period_manage": ("period_create", "period_edit"),
    "team_manage": ("team_create", "team_edit", "team_delete", "member_add"),
    "permission_grant": ("permission_manage", "permission_grant"),
}

# 새로 추가된 권한 항목입니다. 옛 목록을 전부 가진 permission set(헤드매니저의 permission set)에만
# 추가합니다. 그 permission set 은 "할 수 있는 일 전부"라는 의미이므로 새 항목이 빠지면 안 됩니다.
# 그 밖의 permission set 에는 추가하지 않습니다.
ADDED = ("board_moderate", "reservation_manage")


def _array(names: Sequence[str]) -> str:
    return "ARRAY[{}]::text[]".format(", ".join(f"'{name}'" for name in names))


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT, "permission_sets", type_="check")

    # 나뉜 항목부터 채웁니다. 옛 이름을 삭제하는 것은 전부 채운 뒤에 한 번에 진행합니다.
    for old, parts in SPLIT.items():
        op.execute(
            "UPDATE permission_sets"
            f" SET permissions = permissions || {_array(parts)}"
            f" WHERE '{old}' = ANY(permissions)"
        )

    # "할 수 있는 일 전부"인 permission set 을 선택하는 조건에서 join_approve 는 제외합니다.
    # 이 항목은 삭제 대상이라, 한 번 upgrade 했다가 downgrade 하면 복원되지 않습니다.
    # 이 항목을 조건에 포함하면 두 번째 upgrade 에서 전부 가진 permission set 을 인식하지 못합니다.
    full = tuple(name for name in OLD if name != "join_approve")
    op.execute(
        "UPDATE permission_sets"
        f" SET permissions = permissions || {_array(ADDED)}"
        f" WHERE permissions @> {_array(full)}"
    )

    # 옛 이름과 삭제된 항목을 제거합니다. 새 목록에도 있는 이름(permission_grant)은
    # 나뉜 조각 중 하나이기도 하므로, 이 단계에서 삭제하면 방금 추가한 항목도 함께 제거됩니다.
    gone = tuple(name for name in tuple(SPLIT) + ("join_approve",) if name not in NEW)
    op.execute(
        "UPDATE permission_sets SET permissions = ("
        "  SELECT COALESCE(array_agg(name), ARRAY[]::text[])"
        "  FROM unnest(permissions) AS name"
        f"  WHERE name <> ALL({_array(gone)})"
        ")"
    )

    op.create_check_constraint(
        CONSTRAINT, "permission_sets", f"permissions <@ {_array(NEW)}"
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, "permission_sets", type_="check")

    for old, parts in SPLIT.items():
        # 나뉜 항목 중 하나라도 활성화되어 있으면 옛 항목을 활성화합니다.
        op.execute(
            "UPDATE permission_sets"
            f" SET permissions = permissions || ARRAY['{old}']::text[]"
            f" WHERE permissions && {_array(parts)}"
        )

    # 나뉜 조각 중 permission_grant 는 옛 이름이기도 합니다. 이를 삭제하면
    # downgrade 뒤 누구도 권한을 부여할 수 없게 됩니다. 옛 목록에 없는 조각만 삭제합니다.
    dropped = tuple(
        name for parts in SPLIT.values() for name in parts if name not in OLD
    )
    dropped += ("board_moderate", "reservation_manage")
    op.execute(
        "UPDATE permission_sets SET permissions = ("
        "  SELECT COALESCE(array_agg(name), ARRAY[]::text[])"
        "  FROM unnest(permissions) AS name"
        f"  WHERE name <> ALL({_array(dropped)})"
        ")"
    )

    op.create_check_constraint(
        CONSTRAINT, "permission_sets", f"permissions <@ {_array(OLD)}"
    )
