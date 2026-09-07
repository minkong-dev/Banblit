"""permission sets

Revision ID: b7f1a92c4d31
Revises: 010cbf76a692
Create Date: 2026-09-07 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b7f1a92c4d31'
down_revision: Union[str, Sequence[str], None] = '010cbf76a692'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 이 시점의 권한 항목 열한 가지. 마이그레이션은 지나간 시점을 그대로 재현해야 하므로
# db/models.py 의 Permission 을 불러오지 않고 여기 적어 둔다 — 나중에 항목이 늘어도
# 이 파일이 만드는 스키마는 그때 그대로여야 한다.
PERMISSIONS = (
    'room_manage',
    'period_manage',
    'team_manage',
    'member_remove',
    'join_approve',
    'assign_run',
    'assign_read',
    'proposal_confirm',
    'rollback',
    'notice_write',
    'permission_grant',
)
_ARRAY_SQL = "ARRAY[{}]::text[]".format(", ".join(f"'{name}'" for name in PERMISSIONS))

FULL_SET_NAME = '헤드매니저'


def upgrade() -> None:
    """Upgrade schema."""
    # 권한 묶음. 켜진 항목을 배열 한 칸에 담는다 — 항목 목록 자체는 코드가 고정하고,
    # 여기에는 어느 것이 켜졌는지만 남는다.
    op.create_table(
        'permission_sets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('permissions', postgresql.ARRAY(sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    # <@ 는 왼쪽 배열이 오른쪽 배열에 전부 들어 있는지 보는 연산자다.
    op.create_check_constraint(
        'permission_sets_permissions_valid',
        'permission_sets',
        f"permissions <@ {_ARRAY_SQL}",
    )

    # 한 사람이 여러 묶음을 가질 수 있다. 실제 권한은 그 합집합이다.
    op.create_table(
        'member_permission_sets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('member_id', sa.Integer(), nullable=False),
        sa.Column('permission_set_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(
            ['permission_set_id'], ['permission_sets.id'], ondelete='CASCADE'
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('member_id', 'permission_set_id'),
    )

    # 지금까지의 헤드매니저는 "열한 가지가 전부 켜진 묶음을 가진 사람"으로 옮긴다.
    # 묶음은 헤드매니저가 없는 저장소에도 심는다 — 나중에 첫 계정이 이 묶음을 받는다.
    op.execute(
        "INSERT INTO permission_sets (name, permissions)"
        f" VALUES ('{FULL_SET_NAME}', {_ARRAY_SQL})"
    )
    op.execute(
        "INSERT INTO member_permission_sets (member_id, permission_set_id)"
        f" SELECT id, (SELECT id FROM permission_sets WHERE name = '{FULL_SET_NAME}')"
        " FROM members WHERE role = 'head_manager'"
    )

    op.drop_constraint('members_role_valid', 'members', type_='check')
    op.drop_column('members', 'role')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        'members',
        sa.Column('role', sa.Text(), nullable=False, server_default='member'),
    )
    op.create_check_constraint(
        'members_role_valid', 'members', "role IN ('head_manager', 'member')"
    )
    # 열한 가지가 전부 켜진 묶음을 가진 사람만 헤드매니저로 되돌린다.
    # @> 는 왼쪽 배열이 오른쪽 배열을 전부 품고 있는지 보는 연산자다(<@ 의 반대 방향).
    op.execute(
        "UPDATE members SET role = 'head_manager' WHERE id IN ("
        " SELECT ms.member_id FROM member_permission_sets ms"
        " JOIN permission_sets s ON s.id = ms.permission_set_id"
        f" WHERE s.permissions @> {_ARRAY_SQL})"
    )

    op.drop_table('member_permission_sets')
    op.drop_table('permission_sets')
