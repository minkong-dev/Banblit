"""배정 table 2개에 period_id index 를 추가합니다.

배정 저장·조회·삭제·백업은 전부 period_id 로 행을 찾습니다. PostgreSQL 은 외래 키에 index 를
자동으로 생성하지 않으므로, index 가 없으면 배정 1회마다 두 table 을 처음부터 끝까지 읽습니다.
assignment_backups 는 같은 기간의 배정기록을 saved_at 으로 구분하고 정렬하므로 두 열을 묶습니다.

Revision ID: 3c9d41b7e2a5
Revises: 080a74e46f56
Create Date: 2026-09-18
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "3c9d41b7e2a5"
down_revision: Union[str, Sequence[str], None] = "080a74e46f56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_assignments_period_id", "assignments", ["period_id"])
    op.create_index(
        "ix_assignment_backups_period_id_saved_at", "assignment_backups", ["period_id", "saved_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_assignment_backups_period_id_saved_at", table_name="assignment_backups")
    op.drop_index("ix_assignments_period_id", table_name="assignments")
