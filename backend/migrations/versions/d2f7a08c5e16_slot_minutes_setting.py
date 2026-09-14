"""점유 단위(분)를 설정으로 옮깁니다.

예약과 배정이 쓰는 시간 칸의 크기가 코드에 1시간으로 박혀 있었습니다. 동아리마다 10분·30분처럼
다르게 쓰고 싶어 해서 권한자가 고르는 값으로 바꿉니다.

Revision ID: d2f7a08c5e16
Revises: c8e4a1b60d93
Create Date: 2026-09-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2f7a08c5e16'
down_revision: Union[str, Sequence[str], None] = 'c8e4a1b60d93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 설정은 저장소 전체에 하나뿐입니다. id 를 1 로 못박아 행이 둘 이상 생기지 않게 합니다.
    # 별도의 키·값 table 로 두지 않는 것은, 값마다 허용 범위가 달라 CHECK 로 지킬 수 없기 때문입니다.
    op.create_table(
        'settings',
        sa.Column('id', sa.Integer(), nullable=False),
        # 예약과 배정이 쓰는 시간 칸의 크기입니다. 한 시간을 남김없이 나누어야 격자가
        # 고르게 떨어지므로 60 의 약수만 받습니다.
        sa.Column('slot_minutes', sa.Integer(), nullable=False, server_default='60'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('id = 1'),
        sa.CheckConstraint('slot_minutes BETWEEN 5 AND 60 AND 60 % slot_minutes = 0'),
    )

    # 설정을 읽는 쪽이 행이 없는 경우를 따로 다루지 않도록 여기서 한 줄을 넣습니다.
    # 값은 지금까지 코드에 박혀 있던 것과 같은 60 입니다.
    op.execute("INSERT INTO settings (id, slot_minutes) VALUES (1, 60)")


def downgrade() -> None:
    op.drop_table('settings')
