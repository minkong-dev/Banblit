"""settings.slot_minutes 의 허용 값을 목록으로 고정합니다.

이전 제약은 "slot_minutes BETWEEN 5 AND 60 AND 60 % slot_minutes = 0" 이라 6 을 허용했습니다.
API(api/schemas.py)와 화면(frontend/src/lib/settings.ts)은 6 을 거절하므로, DB 를 직접 수정하면
화면이 표시하지 못하는 값이 저장될 수 있었습니다. 허용 값을 목록으로 적어 3곳을 일치시킵니다.

6 을 제외하는 이유는 합주실을 6분 단위로 예약하는 경우가 없기 때문입니다.

이미 6 이 저장된 행은 제약을 다시 만들기 전에 기본값 60 으로 변경합니다. 남겨 두면 제약 생성이
실패합니다. API 가 6 을 거절해 왔으므로 그런 행이 존재할 경로는 DB 직접 수정뿐입니다.

Revision ID: c4a8e70b52d9
Revises: 9b2f5d81ac34
Create Date: 2026-09-19
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "c4a8e70b52d9"
down_revision: Union[str, Sequence[str], None] = "9b2f5d81ac34"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "settings_slot_minutes_check"
_ALLOWED = (5, 10, 12, 15, 20, 30, 60)
_BEFORE = "slot_minutes BETWEEN 5 AND 60 AND 60 % slot_minutes = 0"


def upgrade() -> None:
    op.execute("UPDATE settings SET slot_minutes = 60 WHERE slot_minutes = 6")
    op.drop_constraint(_CONSTRAINT, "settings", type_="check")
    op.create_check_constraint(
        _CONSTRAINT,
        "settings",
        "slot_minutes IN ({})".format(", ".join(str(one) for one in _ALLOWED)),
    )


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT, "settings", type_="check")
    op.create_check_constraint(_CONSTRAINT, "settings", _BEFORE)
