"""집중 합주기간에 마감 일시와 확정 시각을 추가하고, 알림 종류에 확정과 확정 해제를 추가합니다(사용자 결정 2026-10-20).

periods.closes_at 이 지나면 자동 배정 job 이 1회 계산해 적용하고 periods.fixed_at 을 남깁니다. 확정은 마감 일시가 있어야 하므로
CHECK 로 지킵니다(db/models.py 의 같은 이름 제약). 확정 해제 알림은 사유를 반드시 가집니다.

Revision ID: b6f3d8a2c915
Revises: 7d3c9a1e5b24
Create Date: 2026-10-20 18:30:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "b6f3d8a2c915"
down_revision: Union[str, Sequence[str], None] = "7d3c9a1e5b24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("periods", sa.Column("closes_at", sa.DateTime(), nullable=True))
    op.add_column("periods", sa.Column("fixed_at", sa.DateTime(), nullable=True))
    op.create_check_constraint("periods_fixed_needs_close", "periods", "fixed_at IS NULL OR closes_at IS NOT NULL")
    op.drop_constraint("notifications_kind_check", "notifications", type_="check")
    op.create_check_constraint(
        "notifications_kind_check", "notifications",
        "kind IN ('assignment_updated', 'reservation_cancelled', 'rejected', 'assignment_fixed', 'assignment_unfixed')",
    )
    op.create_check_constraint(
        "notifications_unfixed_reason", "notifications", "kind <> 'assignment_unfixed' OR reason IS NOT NULL"
    )


def downgrade() -> None:
    # 확정, 확정 해제 알림이 남아 있으면 옛 종류 CHECK 를 다시 만들 수 없어 먼저 삭제합니다.
    op.execute("DELETE FROM notifications WHERE kind IN ('assignment_fixed', 'assignment_unfixed')")
    op.drop_constraint("notifications_unfixed_reason", "notifications", type_="check")
    op.drop_constraint("notifications_kind_check", "notifications", type_="check")
    op.create_check_constraint(
        "notifications_kind_check", "notifications",
        "kind IN ('assignment_updated', 'reservation_cancelled', 'rejected')",
    )
    op.drop_constraint("periods_fixed_needs_close", "periods", type_="check")
    op.drop_column("periods", "fixed_at")
    op.drop_column("periods", "closes_at")
