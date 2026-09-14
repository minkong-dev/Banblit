"""불가능 시간에 매일 반복과 사유를 추가합니다.

반복은 매주 하나뿐이었습니다. 화면이 "매일 혹은 매주"라고 안내하면서 실제로는 매주만
저장하고 있었으므로, 매일 반복을 따로 추가합니다. 두 값을 동시에 활성화하는 것은
의미가 없으므로 입력 검증 단계(api/input.py 의 require_one_repeat_cycle)에서
차단합니다. 이미 저장된 행이 있으므로 하나의 column 으로 합치지 않습니다.

사유는 사람이 입력하는 한 줄입니다. 배정 엔진은 사용하지 않으며 화면에만 표시합니다.
이미 저장된 행에는 임의의 값을 입력하지 않고 NULL 로 설정합니다.

Revision ID: a92c7f0d3b51
Revises: f3c60d2a9187
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a92c7f0d3b51"
down_revision: Union[str, Sequence[str], None] = "f3c60d2a9187"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 이미 저장된 행은 매일 반복이 아닙니다. server_default 로 채운 다음 기본값을 제거합니다.
    # 앞으로 저장될 행의 값은 애플리케이션이 정합니다.
    op.add_column(
        "unavailable_times",
        sa.Column(
            "repeats_daily", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.alter_column("unavailable_times", "repeats_daily", server_default=None)
    op.add_column(
        "unavailable_times", sa.Column("reason", sa.String(length=200), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("unavailable_times", "reason")
    op.drop_column("unavailable_times", "repeats_daily")
