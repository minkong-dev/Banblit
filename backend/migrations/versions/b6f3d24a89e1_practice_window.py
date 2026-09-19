"""팀별합주를 배정할 수 있는 하루 중의 시간대(periods.practice_*)를 추가합니다.

지금까지 자동 배정은 합주실 개방시각 전체를 배정 대상으로 삼았습니다. 그런데 합주실이 09시에
열어도 팀별합주는 17시부터만 하는 것이 보통이고, 낮 시간은 선착순 예약으로 씁니다. 집중합주기간이
합주실 개방시각과 같아야 할 이유가 없습니다.

평일(월~금)과 주말(토·일)을 각각 한 쌍으로 둡니다. 주말은 낮에도 합주하기 때문입니다.

기존 기간은 네 열 모두 null 입니다. null 은 "시간대를 정하지 않았다"는 뜻이고, 그날은 지금처럼
합주실 개방시각 전체를 씁니다. 그래서 이 마이그레이션만으로는 배정 결과가 달라지지 않습니다.

Revision ID: b6f3d24a89e1
Revises: a5e2c19f74b8
Create Date: 2026-09-20
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "b6f3d24a89e1"
down_revision: Union[str, Sequence[str], None] = "a5e2c19f74b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = (
    "practice_weekday_starts_at",
    "practice_weekday_ends_at",
    "practice_weekend_starts_at",
    "practice_weekend_ends_at",
)
_PAIRS = "periods_practice_window_pairs"
_ORDER = "periods_practice_window_order"


def upgrade() -> None:
    for column in _COLUMNS:
        op.add_column("periods", sa.Column(column, sa.Time(), nullable=True))
    # 한쪽만 채우면 끝 시각 없는 시간대가 되어 배정 구간을 정할 수 없습니다.
    # 두 쌍은 서로 독립입니다 — 평일만 정하고 주말은 개방시각 전체로 둘 수 있습니다.
    op.create_check_constraint(
        _PAIRS,
        "periods",
        "num_nulls(practice_weekday_starts_at, practice_weekday_ends_at) IN (0, 2)"
        " AND num_nulls(practice_weekend_starts_at, practice_weekend_ends_at) IN (0, 2)",
    )
    op.create_check_constraint(
        _ORDER,
        "periods",
        "(practice_weekday_ends_at > practice_weekday_starts_at"
        " OR practice_weekday_starts_at IS NULL)"
        " AND (practice_weekend_ends_at > practice_weekend_starts_at"
        " OR practice_weekend_starts_at IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(_ORDER, "periods", type_="check")
    op.drop_constraint(_PAIRS, "periods", type_="check")
    for column in _COLUMNS:
        op.drop_column("periods", column)
