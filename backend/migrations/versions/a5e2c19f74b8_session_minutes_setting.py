"""합주 1회가 이어지는 길이(settings.session_minutes)를 추가합니다.

지금까지는 slot_minutes 하나가 "합주를 시작할 수 있는 간격"과 "합주가 이어지는 길이"를 겸했습니다.
그래서 30분 칸이면 합주도 30분이고, 배정 엔진은 흩어진 30분 칸을 따로따로 골랐습니다. 실제로는
18:30 에 시작해 19:30 에 끝나는 1시간 합주가 보통이고, 시작 간격과 길이는 다른 값입니다.

기존 저장소는 60 으로 채웁니다. slot_minutes 의 허용 값(5·10·12·15·20·30·60)이 모두 60 의
약수라, 어떤 칸 크기가 저장되어 있어도 새 CHECK 를 통과합니다.

Revision ID: a5e2c19f74b8
Revises: c4a8e70b52d9
Create Date: 2026-09-20
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "a5e2c19f74b8"
down_revision: Union[str, Sequence[str], None] = "c4a8e70b52d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "settings_session_minutes_fits_slots"
_DEFAULT = 60
_MAX = 240


def upgrade() -> None:
    op.add_column(
        "settings",
        sa.Column(
            "session_minutes",
            sa.Integer(),
            nullable=False,
            server_default=str(_DEFAULT),
        ),
    )
    # 두 열을 함께 보는 조건이라 열 하나의 CHECK 로는 지킬 수 없어 table 단위로 둡니다.
    # 한쪽만 바꿔 조건이 깨지는 UPDATE 도 이 제약이 거절합니다.
    op.create_check_constraint(
        _CONSTRAINT,
        "settings",
        "session_minutes >= slot_minutes"
        " AND session_minutes % slot_minutes = 0"
        f" AND session_minutes <= {_MAX}",
    )


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT, "settings", type_="check")
    op.drop_column("settings", "session_minutes")
