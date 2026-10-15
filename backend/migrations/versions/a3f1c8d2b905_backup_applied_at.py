"""스케줄링 기록에 확정 시각(applied_at)을 추가합니다.

권한자가 기록을 적용하면 그 기록에 "n월 n일 확정" 을 표시합니다(사용자 결정 2026-10-15). 기존 기록은 적용 시각을
알 수 없으므로 NULL 로 둡니다.

Revision ID: a3f1c8d2b905
Revises: e4a9b7c2d150
Create Date: 2026-10-15
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f1c8d2b905"
down_revision: Union[str, Sequence[str], None] = "e4a9b7c2d150"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("assignment_backups", sa.Column("applied_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("assignment_backups", "applied_at")
