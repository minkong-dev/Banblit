"""reservations

Revision ID: 9688ede756d5
Revises: a1c7e5f3b9d2
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9688ede756d5'
down_revision: Union[str, Sequence[str], None] = 'a1c7e5f3b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('reservations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('room_id', sa.Integer(), nullable=False),
    sa.Column('team_id', sa.Integer(), nullable=True),
    sa.Column('member_id', sa.Integer(), nullable=False),
    sa.Column('starts_at', sa.DateTime(), nullable=False),
    sa.Column('ends_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint('ends_at > starts_at'),
    sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('room_id', 'starts_at')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('reservations')
