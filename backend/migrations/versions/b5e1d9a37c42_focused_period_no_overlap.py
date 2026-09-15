"""집중 합주기간끼리 날짜가 겹치지 않게 합니다(patch_note 8번).

지금까지는 겹치는 집중 합주기간을 등록할 수 있었고, 달력은 시작일이 가장 이른 하나만 표시했습니다.
전체합주 옵션이 날짜마다 어느 기간에 속하는지 정해야 하므로 한 날짜는 집중 합주기간 하나에만 속해야 합니다.

"매일"(everyday) 기간은 종료일이 없으므로(사용자 결정 2026-09-11) 범위의 끝을 비워 무기한으로 봅니다.
상시 개방(open) 기간은 검사하지 않습니다.

이미 겹치는 집중 합주기간이 저장되어 있으면 upgrade 가 실패합니다. 어느 기간을 남길지는 사람이 정해야 해서
자동으로 삭제하지 않습니다.

Revision ID: b5e1d9a37c42
Revises: c3f7b2e84d19
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "b5e1d9a37c42"
down_revision: Union[str, Sequence[str], None] = "c3f7b2e84d19"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 위반 문장을 이 이름으로 찾습니다(services/period_crud_service.py).
OVERLAP = "periods_focused_no_overlap"


def upgrade() -> None:
    op.execute(
        f"ALTER TABLE periods ADD CONSTRAINT {OVERLAP} EXCLUDE USING gist "
        "(daterange(starts_on, CASE WHEN everyday THEN NULL ELSE ends_on END, '[]') WITH &&) "
        "WHERE (kind = 'focused')"
    )


def downgrade() -> None:
    op.drop_constraint(OVERLAP, "periods")
