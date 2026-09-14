"""권한 묶음을 생성합니다.

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

# 이 시점의 권한 항목 열한 가지입니다. migration(DB 구조를 바꾸는 단계별 기록)은
# 지나간 시점을 그대로 재현해야 하므로 db/models.py 의 Permission 을 참조하지 않고
# 여기 정의합니다. 나중에 항목이 추가되어도 이 파일이 생성하는 schema 는
# 당시 상태를 유지해야 합니다.
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
    """Schema 를 업그레이드합니다."""
    # 권한 묶음입니다. 활성화된 권한을 배열 하나에 저장합니다. 권한 항목 목록 자체는
    # 코드에서 고정하고, 여기에는 어떤 권한이 활성화되었는지만 저장됩니다.
    op.create_table(
        'permission_sets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('permissions', postgresql.ARRAY(sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    # <@ 는 왼쪽 배열의 모든 원소가 오른쪽 배열에 포함되는지 검사하는 연산자입니다.
    op.create_check_constraint(
        'permission_sets_permissions_valid',
        'permission_sets',
        f"permissions <@ {_ARRAY_SQL}",
    )

    # 멤버 하나가 여러 권한 묶음을 가질 수 있습니다. 실제 권한은 그 합집합입니다.
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

    # 기존의 헤드매니저는 "열한 가지 권한이 모두 활성화된 묶음을 가진 사람"으로
    # 마이그레이션합니다. 권한 묶음은 헤드매니저가 없는 저장소에도 생성합니다.
    # 나중에 첫 계정이 이 묶음을 받게 됩니다.
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
    """Schema 를 downgrade 합니다."""
    op.add_column(
        'members',
        sa.Column('role', sa.Text(), nullable=False, server_default='member'),
    )
    op.create_check_constraint(
        'members_role_valid', 'members', "role IN ('head_manager', 'member')"
    )
    # 열한 가지 권한이 모두 활성화된 묶음을 가진 멤버만 헤드매니저로 복원합니다.
    # @> 는 왼쪽 배열이 오른쪽 배열의 모든 원소를 포함하는지 검사하는 연산자입니다.
    # (<@ 의 역방향)
    op.execute(
        "UPDATE members SET role = 'head_manager' WHERE id IN ("
        " SELECT ms.member_id FROM member_permission_sets ms"
        " JOIN permission_sets s ON s.id = ms.permission_set_id"
        f" WHERE s.permissions @> {_ARRAY_SQL})"
    )

    op.drop_table('member_permission_sets')
    op.drop_table('permission_sets')
