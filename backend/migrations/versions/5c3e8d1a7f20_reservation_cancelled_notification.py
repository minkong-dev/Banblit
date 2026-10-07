"""알림 종류에 reservation_cancelled 를 추가합니다.

집중 합주기간을 만들거나 넓히면 그 안의 예약을 취소하고 예약자에게 이 종류의 알림을 남깁니다
(services/reservation_service.py 의 cancel_reservations_in_focus). 허용 종류는 db/models.py 의
NotificationKind 에 작성되어 있는 내용을 기준으로 하고, 이 CHECK 는 그 목록과 같아야 합니다.

Revision ID: 5c3e8d1a7f20
Revises: 11ab2762cdc9
Create Date: 2026-09-28 18:40:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = '5c3e8d1a7f20'
down_revision: Union[str, Sequence[str], None] = '11ab2762cdc9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('notifications_kind_check', 'notifications', type_='check')
    op.create_check_constraint(
        'notifications_kind_check', 'notifications',
        "kind IN ('assignment_updated', 'reservation_cancelled')",
    )


def downgrade() -> None:
    # 되돌리기 전에 새 종류의 알림을 지웁니다. 남아 있으면 옛 CHECK 를 다시 만들 수 없습니다.
    op.execute("DELETE FROM notifications WHERE kind = 'reservation_cancelled'")
    op.drop_constraint('notifications_kind_check', 'notifications', type_='check')
    op.create_check_constraint(
        'notifications_kind_check', 'notifications', "kind IN ('assignment_updated')"
    )
