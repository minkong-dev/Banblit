"""accounts and roles

Revision ID: a1c7e5f3b9d2
Revises: 92d0d767d186
Create Date: 2026-09-04 05:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c7e5f3b9d2'
down_revision: Union[str, Sequence[str], None] = '92d0d767d186'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # members를 계정으로 넓힌다 — 기존 스케줄링용 사람은 이 셋이 비어 있고, 로그인
    # 계정은 가입할 때 셋을 함께 채운다. 별 표를 새로 두지 않는 이유는
    # posts.author_id·comments.author_id·memberships.member_id 가 이미 members.id를
    # 참조하고 있어, 계정을 분리하면 그 참조들을 전부 옮겨야 하기 때문이다.
    op.add_column('members', sa.Column('email', sa.Text(), nullable=True))
    op.add_column('members', sa.Column('password_hash', sa.Text(), nullable=True))
    op.add_column(
        'members',
        sa.Column('role', sa.Text(), nullable=False, server_default='member'),
    )
    op.create_unique_constraint('members_email_key', 'members', ['email'])
    op.create_check_constraint(
        'members_role_valid', 'members', "role IN ('head_manager', 'member')"
    )

    # 가입할 때 고르는 포지션(계정 전체 기준)은 memberships.position_id(팀별 하나)와
    # 다른 다대다 관계라 표를 새로 둔다.
    op.create_table(
        'member_positions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('member_id', sa.Integer(), nullable=False),
        sa.Column('position_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['position_id'], ['positions.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('member_id', 'position_id'),
    )

    # 화면(SignUp)의 포지션 선택지가 서버 목록보다 하나 더 많다 — 빠진 것만 채운다.
    op.execute(
        "INSERT INTO positions (name) VALUES ('서포터즈') "
        "ON CONFLICT (name) DO NOTHING"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('member_positions')
    op.drop_constraint('members_role_valid', 'members', type_='check')
    op.drop_constraint('members_email_key', 'members', type_='unique')
    op.drop_column('members', 'role')
    op.drop_column('members', 'password_hash')
    op.drop_column('members', 'email')
