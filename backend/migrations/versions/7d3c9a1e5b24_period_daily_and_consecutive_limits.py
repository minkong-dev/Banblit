"""팀당 하루 최대와 최대 연속 시간을 기간의 열로 옮깁니다(사용자 결정 2026-10-20).

settings.daily_max_hours(저장소 전체 1개)를 삭제하고 periods.daily_max_hours·periods.max_consecutive_hours 를 추가합니다.
기존 기간은 두 열 모두 설정에 저장되어 있던 하루 상한을 받습니다. 범위(1~12, 연속 ≤ 하루)는 CHECK 로 지킵니다
(db/models.py 의 같은 이름 제약). autogenerate 는 CHECK 를 만들지 않아 직접 적었습니다.

Revision ID: 7d3c9a1e5b24
Revises: c4e8a2f6b913
Create Date: 2026-10-20 16:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d3c9a1e5b24'
down_revision: Union[str, Sequence[str], None] = 'c4e8a2f6b913'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('periods', sa.Column('daily_max_hours', sa.SmallInteger(), server_default='2', nullable=False))
    op.add_column('periods', sa.Column('max_consecutive_hours', sa.SmallInteger(), server_default='2', nullable=False))
    op.execute(
        "UPDATE periods SET daily_max_hours = settings.daily_max_hours,"
        " max_consecutive_hours = settings.daily_max_hours FROM settings WHERE settings.id = 1"
    )
    op.create_check_constraint('periods_daily_max_hours_range', 'periods', 'daily_max_hours BETWEEN 1 AND 12')
    op.create_check_constraint(
        'periods_max_consecutive_within_daily', 'periods', 'max_consecutive_hours BETWEEN 1 AND daily_max_hours'
    )
    op.drop_constraint('settings_daily_max_hours_range', 'settings', type_='check')
    op.drop_column('settings', 'daily_max_hours')


def downgrade() -> None:
    op.add_column('settings', sa.Column('daily_max_hours', sa.Integer(), server_default=sa.text('3'), nullable=False))
    # 기간마다 다른 값은 1개로 합칠 수 없어 가장 큰 값을 옛 범위 상한 3 이하로 잘라 넣습니다.
    op.execute("UPDATE settings SET daily_max_hours = LEAST(3, COALESCE((SELECT max(daily_max_hours) FROM periods), 3))")
    op.create_check_constraint(
        'settings_daily_max_hours_range', 'settings', 'daily_max_hours BETWEEN 1 AND 3'
    )
    op.drop_constraint('periods_max_consecutive_within_daily', 'periods', type_='check')
    op.drop_constraint('periods_daily_max_hours_range', 'periods', type_='check')
    op.drop_column('periods', 'max_consecutive_hours')
    op.drop_column('periods', 'daily_max_hours')
