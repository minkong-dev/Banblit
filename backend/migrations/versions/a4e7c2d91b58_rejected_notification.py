"""알림 종류에 rejected 를 추가하고, 반려 대상·시각·사유를 담을 열 3개를 추가합니다.

관리 권한자가 다른 멤버의 예약이나 불가능 일정을 반려하면 사유를 담은 알림이 원래 등록한 멤버에게
갑니다. 기존 알림은 종류만 담아 열이 비어 있어도 되므로 3개 열은 전부 nullable 입니다.

Revision ID: a4e7c2d91b58
Revises: d8c1f5a30b74
Create Date: 2026-10-07
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "a4e7c2d91b58"
down_revision: Union[str, Sequence[str], None] = "d8c1f5a30b74"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("target", sa.Text(), nullable=True))
    op.add_column("notifications", sa.Column("target_starts_at", sa.DateTime(), nullable=True))
    op.add_column("notifications", sa.Column("reason", sa.Text(), nullable=True))
    op.drop_constraint("notifications_kind_check", "notifications", type_="check")
    op.create_check_constraint(
        "notifications_kind_check", "notifications",
        "kind IN ('assignment_updated', 'reservation_cancelled', 'rejected')",
    )
    op.create_check_constraint(
        "notifications_target_valid", "notifications",
        "target IS NULL OR target IN ('reservation', 'unavailable')",
    )
    op.create_check_constraint(
        "notifications_rejected_fields", "notifications",
        "(kind = 'rejected') = "
        "(target IS NOT NULL AND target_starts_at IS NOT NULL AND reason IS NOT NULL)",
    )


def downgrade() -> None:
    # 되돌리기 전에 반려 알림을 지웁니다. 남아 있으면 옛 종류 CHECK 를 다시 만들 수 없습니다.
    op.execute("DELETE FROM notifications WHERE kind = 'rejected'")
    op.drop_constraint("notifications_rejected_fields", "notifications", type_="check")
    op.drop_constraint("notifications_target_valid", "notifications", type_="check")
    op.drop_constraint("notifications_kind_check", "notifications", type_="check")
    op.create_check_constraint(
        "notifications_kind_check", "notifications",
        "kind IN ('assignment_updated', 'reservation_cancelled')",
    )
    op.drop_column("notifications", "reason")
    op.drop_column("notifications", "target_starts_at")
    op.drop_column("notifications", "target")
