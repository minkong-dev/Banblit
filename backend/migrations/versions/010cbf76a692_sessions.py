"""로그인 session(로그인 상태를 담는 서버 쪽 기록) table 을 생성합니다.

Revision ID: 010cbf76a692
Revises: 9688ede756d5
Create Date: 2026-09-04 08:59:53.607008

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '010cbf76a692'
down_revision: Union[str, Sequence[str], None] = '9688ede756d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 로그인 session 입니다. 서버가 token 을 취소할 수 있도록 DB 에 저장된 활성 session 만 유효로 판정합니다.
    op.create_table(
        'sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.Text(), nullable=False),
        sa.Column('member_id', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('sessions')
