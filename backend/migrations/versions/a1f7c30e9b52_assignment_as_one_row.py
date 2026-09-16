"""배정을 칸마다 한 행이 아니라 구간 한 행으로 저장합니다.

점유 단위를 설정에서 변경할 수 있게 되면서(PATCH /settings), 5분 단위로 두면 합주실 하나의
하루치가 수백 행이 됩니다. 같은 팀이 이어 쓰는 칸을 한 행으로 합치고, 같은 합주실에서 시간이
겹치는 행은 예약과 같은 방식(EXCLUDE)으로 DB 가 직접 거절합니다.

이미 저장된 행은 합치지 않습니다. 배정은 계산할 때마다 그 기간의 행을 전부 지우고 다시 쓰므로
(db/schedule_store.py 의 save_schedule), 다음 계산에서 합쳐집니다. 그때까지 칸마다 한 행으로
남아 있어도 겹치지 않으므로 새 제약에 걸리지 않습니다.

Revision ID: a1f7c30e9b52
Revises: f2a9c7b03e51
Create Date: 2026-09-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1f7c30e9b52'
down_revision: Union[str, Sequence[str], None] = 'f2a9c7b03e51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 겹침 금지 제약의 이름입니다. 위반했을 때 보여줄 문장을 이 이름으로 찾습니다
# (db/schedule_store.py 의 SCHEDULE_MESSAGES).
OVERLAP = 'assignments_no_overlap'
# 칸마다 한 행이던 시절의 제약 이름입니다. 되돌릴 때 이 이름으로 다시 만듭니다.
UNIQUE = 'assignments_room_id_starts_at_key'


def upgrade() -> None:
    # gist index 는 범위·기하 자료형만 다룹니다. room_id 같은 정수를 = 로 함께 묶으려면
    # 이 확장이 필요합니다. 예약 migration(c8e4a1b60d93)이 이미 만들었으나, 그 migration 을
    # 거치지 않은 DB 에서도 돌도록 여기서도 확인합니다.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")

    op.drop_constraint(UNIQUE, 'assignments', type_='unique')
    # 구간의 끝은 포함하지 않아(반열린 구간) 앞 배정이 끝나는 시각에 다음 배정이 시작할 수 있습니다.
    # 시각에 시간대를 붙이지 않으므로 tstzrange 가 아니라 tsrange 입니다.
    op.execute(
        f"ALTER TABLE assignments ADD CONSTRAINT {OVERLAP} "
        "EXCLUDE USING gist (room_id WITH =, tsrange(starts_at, ends_at) WITH &&)"
    )
    # 달력은 합주실과 날짜로 조회합니다. unique 제약이 만들던 index 를 대신합니다.
    op.create_index('ix_assignments_room_starts_at', 'assignments', ['room_id', 'starts_at'])


def downgrade() -> None:
    # 저장된 배정을 비웁니다. 합쳐진 구간을 칸으로 되돌릴 방법이 없고(칸 크기가 그 사이에
    # 변경되었을 수 있습니다), 남겨 두면 옛 코드가 한 구간을 한 칸으로 읽어 오류 없이 잘못된
    # 시간표를 표시합니다. 배정은 사람이 입력한 값이 아니라 계산 결과라, 다음 계산 시각에
    # 다시 채워집니다. 예약은 사람이 등록한 값이라 같은 처리를 할 수 없어 예약 migration
    # (c8e4a1b60d93)은 백업 복원을 요구합니다.
    #
    # 되돌리기용 백업도 함께 비웁니다. 백업 행에도 합쳐진 구간이 들어 있습니다.
    op.execute("DELETE FROM assignments")
    op.execute("DELETE FROM assignment_backups")

    op.drop_index('ix_assignments_room_starts_at', table_name='assignments')
    op.execute(f"ALTER TABLE assignments DROP CONSTRAINT {OVERLAP}")
    op.create_unique_constraint(UNIQUE, 'assignments', ['room_id', 'starts_at'])
