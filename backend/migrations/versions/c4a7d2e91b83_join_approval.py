"""팀 참가 신청을 승인 정책으로 관리합니다.

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
    """schema 를 upgrade 합니다."""
    # 기존 팀의 join_policy는 'auto'(즉시 승인)로 설정하여 현재 동작을 유지합니다.
    op.add_column(
        'teams',
        sa.Column('join_policy', sa.Text(), nullable=False, server_default='auto'),
    )
    op.create_check_constraint(
        'teams_join_policy_valid', 'teams', "join_policy IN ('auto', 'approval')"
    )

    # 기존 멤버십의 status는 'approved'(승인됨)로 설정합니다. 승인 대기 상태(pending)는 미구현이었습니다.
    op.add_column(
        'memberships',
        sa.Column('status', sa.Text(), nullable=False, server_default='approved'),
    )
    op.create_check_constraint(
        'memberships_status_valid', 'memberships', "status IN ('approved', 'pending')"
    )


def downgrade() -> None:
    """schema 를 downgrade 합니다."""
    # pending 상태의 멤버십은 확정되지 않은 소속이므로, status 열을 삭제하기 전에 행을 삭제합니다.
    # 이 삭제를 생략하면 status 열이 없어지는 순간 pending 상태의 행들이 승인된 상태로 간주됩니다.
    op.execute("DELETE FROM memberships WHERE status = 'pending'")

    op.drop_constraint('memberships_status_valid', 'memberships', type_='check')
    op.drop_column('memberships', 'status')

    op.drop_constraint('teams_join_policy_valid', 'teams', type_='check')
    op.drop_column('teams', 'join_policy')
