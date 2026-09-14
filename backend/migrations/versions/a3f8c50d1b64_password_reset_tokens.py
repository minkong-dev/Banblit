"""비밀번호 재설정 token table 을 생성합니다.

Revision ID: a3f8c50d1b64
Revises: f6e0b91a7c48
Create Date: 2026-09-07 09:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f8c50d1b64'
down_revision: Union[str, Sequence[str], None] = 'f6e0b91a7c48'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 비밀번호 재설정 token 입니다. sessions 와 같은 구조로 원문이 아니라 해시만 저장합니다.
    # used_at 이 설정되면 해당 token 은 더 이상 사용할 수 없습니다. 한 번만 사용됩니다.
    op.create_table(
        'password_reset_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.Text(), nullable=False),
        sa.Column('member_id', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('password_reset_tokens')
