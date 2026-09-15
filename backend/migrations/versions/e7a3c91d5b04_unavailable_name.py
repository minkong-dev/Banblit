"""불가능 시간에 일정 이름을 추가합니다.

캘린더에 표시할 이름입니다. 예약(reservations.name)과 같은 용도이고 길이 상한도 같은 60자입니다.
비어 있으면 화면이 "불가능 일정"으로 표시합니다. 배정 엔진은 사용하지 않습니다.

Revision ID: e7a3c91d5b04
Revises: d2f7a08c5e16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7a3c91d5b04"
down_revision: Union[str, Sequence[str], None] = "d2f7a08c5e16"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "unavailable_times", sa.Column("name", sa.String(length=60), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("unavailable_times", "name")
