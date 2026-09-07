"""assignment runs

Revision ID: 0e65e95acef3
Revises: b7f1a92c4d31
Create Date: 2026-09-07 07:39:05.242266

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e65e95acef3'
down_revision: Union[str, Sequence[str], None] = 'b7f1a92c4d31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('assignment_runs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('period_id', sa.Integer(), nullable=False),
    sa.Column('run_on', sa.Date(), nullable=False),
    sa.Column('slot', sa.Text(), nullable=False),
    sa.Column('ran_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("slot IN ('first', 'second')"),
    sa.ForeignKeyConstraint(['period_id'], ['periods.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('period_id', 'run_on', 'slot')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('assignment_runs')
