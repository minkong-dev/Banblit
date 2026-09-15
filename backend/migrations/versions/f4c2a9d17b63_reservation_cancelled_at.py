"""예약 취소·이동의 이력을 남깁니다.

지금까지는 취소하면 행을 지우고, 이동하면 행의 시각을 고쳐 흔적이 남지 않았습니다. 이제 취소는
cancelled_at 만 기록하고, 이동은 옛 행을 취소 표시로 두고 새 행을 만듭니다(Cal.com 의 Booking 방식).

겹침 금지 제약은 취소된 행을 보지 않아야 합니다. 그렇지 않으면 취소한 시간을 아무도 다시 예약할 수
없습니다. 제약에 WHERE 조건을 붙이려면 다시 만들어야 합니다.

Revision ID: f4c2a9d17b63
Revises: e7a3c91d5b04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f4c2a9d17b63"
down_revision: Union[str, Sequence[str], None] = "e7a3c91d5b04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 제약 이름은 c8e4a1b60d93 과 같습니다. 위반 문장을 이 이름으로 찾습니다(services/reservation_service.py).
OVERLAP = "reservations_no_overlap"


def upgrade() -> None:
    op.add_column("reservations", sa.Column("cancelled_at", sa.DateTime(), nullable=True))
    op.drop_constraint(OVERLAP, "reservations")
    op.execute(
        f"ALTER TABLE reservations ADD CONSTRAINT {OVERLAP} "
        "EXCLUDE USING gist (room_id WITH =, tsrange(starts_at, ends_at) WITH &&) "
        "WHERE (cancelled_at IS NULL)"
    )


def downgrade() -> None:
    # 취소된 행은 조건 없는 제약과 겹칠 수 있어 먼저 지웁니다. 이력이 사라집니다.
    op.execute("DELETE FROM reservations WHERE cancelled_at IS NOT NULL")
    op.drop_constraint(OVERLAP, "reservations")
    op.execute(
        f"ALTER TABLE reservations ADD CONSTRAINT {OVERLAP} "
        "EXCLUDE USING gist (room_id WITH =, tsrange(starts_at, ends_at) WITH &&)"
    )
    op.drop_column("reservations", "cancelled_at")
