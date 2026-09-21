"""notifications.read_at 을 삭제합니다.

읽음 처리가 read_at 을 설정하는 대신 행을 삭제하도록 변경되어, 이 열은 언제나 null 입니다
(services/notification_service.py 의 mark_all_read). 읽지 않은 알림만 table 에 남습니다.

읽음 표시만 남기던 이전 방식에는 행을 삭제하는 경로가 없었습니다. 알림은 배정 1회마다 배정받은
팀의 멤버 전원에게 1행씩 생성되고, 조회는 상한 없이 전 행을 반환하며 화면은 20초마다 다시
조회하므로, 운영 기간에 비례해 전송량이 증가했습니다.

downgrade 는 열을 다시 만들지만 값은 복원하지 않습니다. 삭제된 행은 되돌릴 수 없습니다.

Revision ID: 9b2f5d81ac34
Revises: 7e1a4c93d6f0
Create Date: 2026-09-19
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "9b2f5d81ac34"
down_revision: Union[str, Sequence[str], None] = "7e1a4c93d6f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("notifications", "read_at")


def downgrade() -> None:
    op.add_column(
        "notifications", sa.Column("read_at", sa.DateTime(), nullable=True)
    )
