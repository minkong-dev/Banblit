"""불가능 일정의 반복을 요일 집합과 횟수로 저장합니다(unavailable_times.repeat_*).

지금까지 반복은 repeats_daily·repeats_weekly 두 개의 참/거짓 열이었습니다. 매일이거나, 시작일과
같은 요일마다이거나, 둘 중 하나만 고를 수 있었습니다. 월·수·금만 고르는 것이 불가능하고 몇 번
반복할지 적을 자리도 없습니다.

repeat_weekdays 하나로 합칩니다. 월요일 1, 화요일 2, 수요일 4 … 일요일 64 를 더해 저장하고,
date.weekday() 와 같은 순서입니다. null 이나 0 은 반복하지 않는다는 뜻이고 127 이 매일입니다.
끝나는 조건은 repeat_count(횟수)나 repeat_until(종료일) 중 하나이고, 둘 다 지정하면 API 가
422 로 거부합니다.

기존 행은 이렇게 옮깁니다 — repeats_daily 가 참이면 127, repeats_weekly 가 참이면 시작일의
요일 하나, 둘 다 거짓이면 null 입니다. 옮긴 뒤 두 열을 삭제합니다.

PostgreSQL 의 EXTRACT(DOW ...) 는 일요일이 0 이고 토요일이 6 입니다. date.weekday() 는 월요일이
0 이므로 (DOW + 6) % 7 로 변환합니다.

Revision ID: d7c5b93e18a2
Revises: b6f3d24a89e1
Create Date: 2026-09-21
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7c5b93e18a2"
down_revision: Union[str, Sequence[str], None] = "b6f3d24a89e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALL_WEEKDAYS = 0b1111111


def upgrade() -> None:
    op.add_column(
        "unavailable_times", sa.Column("repeat_weekdays", sa.SmallInteger(), nullable=True)
    )
    op.add_column(
        "unavailable_times", sa.Column("repeat_count", sa.Integer(), nullable=True)
    )
    op.execute(
        f"""
        UPDATE unavailable_times
        SET repeat_weekdays = CASE
            WHEN repeats_daily THEN {ALL_WEEKDAYS}
            WHEN repeats_weekly
                THEN (1 << ((EXTRACT(DOW FROM starts_at)::int + 6) % 7))
            ELSE NULL
        END
        """
    )
    op.drop_column("unavailable_times", "repeats_daily")
    op.drop_column("unavailable_times", "repeats_weekly")


def downgrade() -> None:
    op.add_column(
        "unavailable_times",
        sa.Column("repeats_daily", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "unavailable_times",
        sa.Column("repeats_weekly", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # 되돌릴 때 요일 조합은 두 개의 참/거짓으로 담을 수 없습니다. 일곱 요일 전부는 매일로,
    # 그 밖의 조합은 매주로 옮깁니다. 고른 요일이 여럿이면 그 정보는 사라집니다.
    op.execute(
        f"""
        UPDATE unavailable_times
        SET repeats_daily = (repeat_weekdays = {ALL_WEEKDAYS}),
            repeats_weekly = (repeat_weekdays IS NOT NULL AND repeat_weekdays <> {ALL_WEEKDAYS})
        """
    )
    op.drop_column("unavailable_times", "repeat_count")
    op.drop_column("unavailable_times", "repeat_weekdays")
