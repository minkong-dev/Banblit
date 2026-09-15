"""집중 합주기간에 전체합주 설정을 저장합니다(patch_note 8번 B단계).

전체합주는 기간 하나에 날짜 범위 하나·합주실 하나·기본 시작/끝 시각으로 지정합니다. 다섯 열을 함께 채우거나
함께 비웁니다. 날짜마다 시각을 다르게 지정하면 ensemble_days 에 그 날짜 한 행을 둡니다.

날짜 범위가 기간 안인지는 CHECK 로 검사합니다. 기간 수정(PATCH)도 이 조건을 어길 수 있어 한 곳에서 거절하기
위해서입니다. "매일" 기간은 종료일이 없으므로(사용자 결정 2026-09-11) 범위 시작일만 기간 시작일 이후면 됩니다.

Revision ID: d9a4c6e1f207
Revises: b5e1d9a37c42
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9a4c6e1f207"
down_revision: Union[str, Sequence[str], None] = "b5e1d9a37c42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 위반 문장을 이 이름으로 찾습니다(services/period_crud_service.py). 조건은 models.py 의 Period 와 같습니다.
CHECKS = {
    "periods_ensemble_all_or_none": (
        "num_nulls(ensemble_starts_on, ensemble_ends_on, ensemble_room_id,"
        " ensemble_starts_at, ensemble_ends_at) IN (0, 5)"
    ),
    "periods_ensemble_focused_only": "ensemble_starts_on IS NULL OR kind = 'focused'",
    "periods_ensemble_within_period": (
        "ensemble_starts_on IS NULL OR (ensemble_starts_on >= starts_on"
        " AND ensemble_ends_on >= ensemble_starts_on AND (everyday OR ensemble_ends_on <= ends_on))"
    ),
    "periods_ensemble_times_order": "ensemble_ends_at > ensemble_starts_at",
}


def upgrade() -> None:
    op.add_column("periods", sa.Column("ensemble_starts_on", sa.Date(), nullable=True))
    op.add_column("periods", sa.Column("ensemble_ends_on", sa.Date(), nullable=True))
    op.add_column("periods", sa.Column("ensemble_room_id", sa.Integer(), nullable=True))
    op.add_column("periods", sa.Column("ensemble_starts_at", sa.Time(), nullable=True))
    op.add_column("periods", sa.Column("ensemble_ends_at", sa.Time(), nullable=True))
    op.create_foreign_key(
        "periods_ensemble_room_id_fkey", "periods", "rooms", ["ensemble_room_id"], ["id"]
    )
    for name, condition in CHECKS.items():
        op.create_check_constraint(name, "periods", condition)

    op.create_table(
        "ensemble_days",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "period_id",
            sa.Integer(),
            sa.ForeignKey("periods.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("starts_at", sa.Time(), nullable=False),
        sa.Column("ends_at", sa.Time(), nullable=False),
        sa.UniqueConstraint("period_id", "day"),
        sa.CheckConstraint("ends_at > starts_at"),
    )


def downgrade() -> None:
    op.drop_table("ensemble_days")
    for column in (
        "ensemble_ends_at",
        "ensemble_starts_at",
        "ensemble_room_id",
        "ensemble_ends_on",
        "ensemble_starts_on",
    ):
        op.drop_column("periods", column)
