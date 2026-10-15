"""하루 중의 범위가 00:00 에 끝날 수 있게 CHECK 제약 4개를 교체합니다.

합주실 운영 시간, 팀별 합주 시간대, 전체 합주 시각(기간 기본값, 날짜별 지정)의 종료 시간이 00:00 이면 다음 날 00:00 으로 봅니다
(사용자 결정 2026-10-12). 00:00 외에 시작 시간보다 이른 종료 시간은 계속 거부합니다.

**downgrade 는 00:00 마감 행이 있으면 실패합니다.** 옛 제약이 그 행을 허용하지 않기 때문입니다.

Revision ID: b5d2e9f17a03
Revises: a3f1c8d2b905
Create Date: 2026-10-15
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

revision: str = "b5d2e9f17a03"
down_revision: Union[str, Sequence[str], None] = "a3f1c8d2b905"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _range(starts: str, ends: str) -> str:
    return f"({ends} > {starts} OR ({ends} = '00:00' AND {starts} <> '00:00'))"


def _practice(rule: str) -> str:
    return " AND ".join(
        f"({rule.format(part=part)} OR practice_{part}_starts_at IS NULL)" for part in ("weekday", "weekend")
    )


def upgrade() -> None:
    op.drop_constraint("rooms_closes_after_opens", "rooms", type_="check")
    op.create_check_constraint("rooms_clock_range", "rooms", _range("opens_at", "closes_at"))
    op.drop_constraint("periods_ensemble_times_order", "periods", type_="check")
    op.create_check_constraint(
        "periods_ensemble_times_order", "periods", _range("ensemble_starts_at", "ensemble_ends_at")
    )
    op.drop_constraint("periods_practice_window_order", "periods", type_="check")
    op.create_check_constraint(
        "periods_practice_window_order",
        "periods",
        _practice(_range("practice_{part}_starts_at", "practice_{part}_ends_at")),
    )
    op.drop_constraint("ensemble_days_check", "ensemble_days", type_="check")
    op.create_check_constraint("ensemble_days_clock_range", "ensemble_days", _range("starts_at", "ends_at"))


def downgrade() -> None:
    op.drop_constraint("ensemble_days_clock_range", "ensemble_days", type_="check")
    op.create_check_constraint("ensemble_days_check", "ensemble_days", "ends_at > starts_at")
    op.drop_constraint("periods_practice_window_order", "periods", type_="check")
    op.create_check_constraint(
        "periods_practice_window_order", "periods", _practice("practice_{part}_ends_at > practice_{part}_starts_at")
    )
    op.drop_constraint("periods_ensemble_times_order", "periods", type_="check")
    op.create_check_constraint("periods_ensemble_times_order", "periods", "ensemble_ends_at > ensemble_starts_at")
    op.drop_constraint("rooms_clock_range", "rooms", type_="check")
    op.create_check_constraint("rooms_closes_after_opens", "rooms", "closes_at > opens_at")
