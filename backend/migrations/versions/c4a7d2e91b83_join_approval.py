"""join approval

Revision ID: c4a7d2e91b83
Revises: 0e65e95acef3
Create Date: 2026-09-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4a7d2e91b83'
down_revision: Union[str, Sequence[str], None] = '0e65e95acef3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 기존 팀은 지금까지의 동작인 즉시 가입을 그대로 유지한다.
    op.add_column(
        'teams',
        sa.Column('join_policy', sa.Text(), nullable=False, server_default='auto'),
    )
    op.create_check_constraint(
        'teams_join_policy_valid', 'teams', "join_policy IN ('auto', 'approval')"
    )

    # 기존 소속은 전부 승인된 상태다 — 승인 대기라는 것이 지금까지 없었다.
    op.add_column(
        'memberships',
        sa.Column('status', sa.Text(), nullable=False, server_default='approved'),
    )
    op.create_check_constraint(
        'memberships_status_valid', 'memberships', "status IN ('approved', 'pending')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # 대기 중인 신청은 소속이 아니므로, 상태 열을 없애기 전에 지운다.
    # 남겨 두면 열이 사라진 순간 전부 소속으로 둔갑한다.
    op.execute("DELETE FROM memberships WHERE status = 'pending'")

    op.drop_constraint('memberships_status_valid', 'memberships', type_='check')
    op.drop_column('memberships', 'status')

    op.drop_constraint('teams_join_policy_valid', 'teams', type_='check')
    op.drop_column('teams', 'join_policy')
