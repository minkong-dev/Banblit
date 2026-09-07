"""attachments

Revision ID: d5c1a83b7e02
Revises: c4a7d2e91b83
Create Date: 2026-09-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5c1a83b7e02'
down_revision: Union[str, Sequence[str], None] = 'c4a7d2e91b83'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'attachments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('stored_name', sa.Text(), nullable=False),
        sa.Column('size', sa.BigInteger(), nullable=False),
        sa.Column('content_type', sa.Text(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint('length(trim(name)) > 0'),
        sa.CheckConstraint('size >= 0'),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('stored_name'),
    )
    op.create_index(op.f('ix_attachments_post_id'), 'attachments', ['post_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_attachments_post_id'), table_name='attachments')
    op.drop_table('attachments')
