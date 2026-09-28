"""팀 하나가 하루에 배정받는 시간의 상한(settings.daily_max_hours)을 추가합니다.

기존 행은 기본값 3시간을 받습니다. 1~3 범위는 CHECK 로 지킵니다(db/models.py 의 같은 이름 제약).
autogenerate 는 CHECK 를 만들지 않아 직접 적었습니다.

Revision ID: 11ab2762cdc9
Revises: f2b7d4e91c05
Create Date: 2026-09-28 18:05:49.023348

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '11ab2762cdc9'
down_revision: Union[str, Sequence[str], None] = 'f2b7d4e91c05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('settings', sa.Column('daily_max_hours', sa.Integer(), server_default=sa.text('3'), nullable=False))
    op.create_check_constraint(
        'settings_daily_max_hours_range', 'settings', 'daily_max_hours BETWEEN 1 AND 3'
    )


def downgrade() -> None:
    op.drop_constraint('settings_daily_max_hours_range', 'settings', type_='check')
    op.drop_column('settings', 'daily_max_hours')
