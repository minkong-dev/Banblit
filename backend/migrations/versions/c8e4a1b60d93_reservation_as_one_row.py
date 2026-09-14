"""예약을 1시간 칸 여러 행이 아니라 구간 한 행으로 저장합니다.

사람이 고르는 것은 구간 하나인데 저장이 칸 단위라, 취소와 이동이 칸마다 따로 일어나
중간에 실패하면 예약이 반만 지워졌습니다. 구간 한 행으로 바꾸고, 선착순은 같은 합주실에서
시간이 겹치는 행을 DB 가 직접 막는 방식으로 옮깁니다.

Revision ID: c8e4a1b60d93
Revises: b3d9f27c0a41
Create Date: 2026-09-15 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8e4a1b60d93'
down_revision: Union[str, Sequence[str], None] = 'b3d9f27c0a41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 겹침 금지 제약의 이름입니다. 위반했을 때 사용자에게 보여줄 문장을 이 이름으로 찾습니다
# (api/reservation_service.py 의 RESERVATION_MESSAGES).
OVERLAP = 'reservations_no_overlap'


def upgrade() -> None:
    # gist index 는 기본적으로 범위·기하 자료형만 다룹니다. room_id 같은 정수를 = 로
    # 함께 묶으려면 이 확장이 필요합니다.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    # 칸 단위로 저장된 기존 행은 구간으로 되돌릴 방법이 없어 table 을 다시 만듭니다.
    # 앞선 migration(b3d9f27c0a41)이 이미 예약을 전부 비웠으므로 잃을 행이 없습니다.
    op.drop_table('reservations')
    op.create_table(
        'reservations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('room_id', sa.Integer(), sa.ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=True),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('members.id', ondelete='CASCADE'), nullable=False),
        # 캘린더에 표시할 이름입니다. 비우면 화면이 팀 이름이나 예약자 이름을 대신 씁니다.
        # 길이는 models.py 의 String(60) 과 같아야 합니다. 다르면 다음 autogenerate 가
        # 둘을 맞추는 migration 을 스스로 만들어 냅니다.
        sa.Column('name', sa.String(60), nullable=True),
        sa.Column('starts_at', sa.DateTime(), nullable=False),
        sa.Column('ends_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint('ends_at > starts_at'),
    )

    # 같은 합주실에서 시간이 겹치는 행을 DB 가 거절합니다. 시각에 시간대를 붙이지 않으므로
    # tstzrange 가 아니라 tsrange 입니다. 구간의 끝은 포함하지 않아(반열린 구간) 앞 예약이
    # 끝나는 시각에 다음 예약이 시작할 수 있습니다.
    op.execute(
        f"ALTER TABLE reservations ADD CONSTRAINT {OVERLAP} "
        "EXCLUDE USING gist (room_id WITH =, tsrange(starts_at, ends_at) WITH &&)"
    )

    # 달력은 합주실과 날짜로 조회합니다.
    op.create_index('ix_reservations_room_starts_at', 'reservations', ['room_id', 'starts_at'])


def downgrade() -> None:
    # 되돌리면 그 사이에 쌓인 예약이 전부 사라집니다. 구간 한 행을 1시간 칸 여러 행으로
    # 되돌릴 방법이 없어 table 을 다시 만들기 때문입니다. 되살리려면 백업에서 복원해야 합니다
    # (COMMAND.md 의 "백업으로 복원하기").
    #
    # btree_gist 확장은 그대로 둡니다. 다른 곳에서 이미 쓰고 있을 수 있어, 되돌린다고
    # 지우는 것이 더 위험합니다.
    op.drop_index('ix_reservations_room_starts_at', table_name='reservations')
    op.drop_table('reservations')
    op.create_table(
        'reservations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('room_id', sa.Integer(), sa.ForeignKey('rooms.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=True),
        sa.Column('member_id', sa.Integer(), sa.ForeignKey('members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('starts_at', sa.DateTime(), nullable=False),
        sa.Column('ends_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('room_id', 'starts_at'),
        sa.CheckConstraint('ends_at > starts_at'),
    )
