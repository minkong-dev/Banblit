"""notifications

Revision ID: f6e0b91a7c48
Revises: d5c1a83b7e02
Create Date: 2026-09-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6e0b91a7c48'
down_revision: Union[str, Sequence[str], None] = 'd5c1a83b7e02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('member_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.CheckConstraint("kind IN ('assignment_updated')"),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notifications_member_id'), 'notifications', ['member_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_notifications_member_id'), table_name='notifications')
    op.drop_table('notifications')
