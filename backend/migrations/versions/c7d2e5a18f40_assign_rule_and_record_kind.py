"""기간에 배정 규칙 열 2개, 스케줄링 기록에 종류 열을 추가합니다.

target_hours_per_team 은 팀당 목표 시간(null 이면 전체 시간 ÷ 팀 수), max_absent_members 는 session 1회의
불참 허용 인원입니다. assignment_backups.kind 는 이전 확정본(previous)과 미확정 배정안(unsaved)을 구분합니다.
이미 저장된 백업은 전부 새 확정에 밀려난 옛 확정본이므로 previous 입니다.

Revision ID: c7d2e5a18f40
Revises: b3f6a9c2d471
Create Date: 2026-10-12
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7d2e5a18f40"
down_revision: Union[str, Sequence[str], None] = "b3f6a9c2d471"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("periods", sa.Column("target_hours_per_team", sa.Integer(), nullable=True))
    op.add_column(
        "periods",
        sa.Column("max_absent_members", sa.SmallInteger(), nullable=False, server_default="0"),
    )
    op.create_check_constraint("periods_target_hours_positive", "periods", "target_hours_per_team > 0")
    op.create_check_constraint("periods_max_absent_not_negative", "periods", "max_absent_members >= 0")
    op.add_column(
        "assignment_backups",
        sa.Column("kind", sa.Text(), nullable=False, server_default="previous"),
    )
    op.create_check_constraint(
        "assignment_backups_kind", "assignment_backups", "kind IN ('previous', 'unsaved')"
    )


def downgrade() -> None:
    op.drop_constraint("assignment_backups_kind", "assignment_backups", type_="check")
    op.drop_column("assignment_backups", "kind")
    op.drop_constraint("periods_max_absent_not_negative", "periods", type_="check")
    op.drop_constraint("periods_target_hours_positive", "periods", type_="check")
    op.drop_column("periods", "max_absent_members")
    op.drop_column("periods", "target_hours_per_team")
