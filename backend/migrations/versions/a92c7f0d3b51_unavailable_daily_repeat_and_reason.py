"""불가능 시간에 매일 반복과 사유를 둔다

반복은 매주 하나뿐이었다. 화면이 "매일 혹은 매주"라고 안내하면서 실제로는 매주만
저장하고 있었으므로, 매일 반복을 따로 둔다. 두 값을 다 켜는 것은 뜻이 없어
경계에서 막는다(api/input.py require_one_repeat_cycle) — 이미 저장된 줄이 있어
하나의 열로 합치지는 않는다.

사유는 사람이 적는 한 줄이다. 엔진은 보지 않고 화면에만 쓴다. 이미 들어와 있는
줄에는 뜻을 지어내지 않고 비워 둔다.

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
    # 이미 있는 줄은 매일 반복이 아니다. server_default 로 채운 뒤 기본값을 걷어낸다 —
    # 앞으로 들어올 줄의 값은 애플리케이션이 정한다.
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
