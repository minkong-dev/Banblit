"""권한 항목을 동작 단위로 나눈다

만들기·수정·삭제·주기가 한 항목에 묶여 있어, 권한을 만드는 사람이 "팀을 만들 수는
있지만 지울 수는 없는" 묶음을 만들 수 없었다. 통로 하나에 항목 하나가 걸리도록 나눈다.

없어진 항목도 함께 정리한다 — join_approve 는 참가 신청 기능이 사라지면서 지킬 자리를
잃었는데 목록에는 남아 있었다.

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

# 이미 저장된 묶음을 옮기는 표. 나뉜 항목은 옛 항목이 켜져 있던 만큼 전부 켠다 —
# 지금 그 일을 하던 사람이 갑자기 못 하게 되면 안 된다.
SPLIT = {
    "room_manage": ("room_create", "room_edit"),
    "period_manage": ("period_create", "period_edit"),
    "team_manage": ("team_create", "team_edit", "team_delete", "member_add"),
    "permission_grant": ("permission_manage", "permission_grant"),
}

# 새로 생긴 항목. 옛 목록을 전부 가진 묶음(헤드매니저 것)에만 얹는다 — 그 묶음은
# "할 수 있는 일 전부"라는 뜻이라 비어 있으면 안 된다. 그 밖의 묶음에는 주지 않는다.
ADDED = ("board_moderate", "reservation_manage")


def _array(names: Sequence[str]) -> str:
    return "ARRAY[{}]::text[]".format(", ".join(f"'{name}'" for name in names))


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT, "permission_sets", type_="check")

    # 나뉜 항목부터 채운다. 옛 이름을 지우는 것은 전부 채운 뒤에 한 번에 한다.
    for old, parts in SPLIT.items():
        op.execute(
            "UPDATE permission_sets"
            f" SET permissions = permissions || {_array(parts)}"
            f" WHERE '{old}' = ANY(permissions)"
        )

    # "할 수 있는 일 전부"인 묶음을 가려내는 조건에서 join_approve 는 뺀다. 이 항목은
    # 없애는 대상이라, 한 번 upgrade 했다 downgrade 하면 되살아나지 않는다. 그것을
    # 조건에 넣으면 두 번째 upgrade 에서 전부 가진 묶음을 못 알아본다.
    full = tuple(name for name in OLD if name != "join_approve")
    op.execute(
        "UPDATE permission_sets"
        f" SET permissions = permissions || {_array(ADDED)}"
        f" WHERE permissions @> {_array(full)}"
    )

    # 옛 이름과 없어진 항목을 걷어낸다. 새 목록에도 있는 이름(permission_grant)은
    # 나뉜 조각 중 하나이기도 해서, 여기서 빼면 방금 채운 것을 도로 지운다.
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
        # 나뉜 것 중 하나라도 켜져 있으면 옛 항목을 켠다.
        op.execute(
            "UPDATE permission_sets"
            f" SET permissions = permissions || ARRAY['{old}']::text[]"
            f" WHERE permissions && {_array(parts)}"
        )

    dropped = tuple(name for parts in SPLIT.values() for name in parts)
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
