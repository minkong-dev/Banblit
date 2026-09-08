"""점유 단위를 30분에서 한 시간으로 바꾼다

사용자 결정이다. 합주실 여닫는 시각도 정시에만 둘 수 있게 좁힌다.

이미 30분에 걸쳐 있던 값은 그대로 두면 새 제약에 걸려 저장 자체가 막히므로 함께
옮긴다 — 여는 시각은 뒤(늦게 열기), 닫는 시각은 앞(일찍 닫기)으로 당긴다. 어느
쪽이든 없던 시간을 만들어 내지 않는 방향이다.

Revision ID: d4a71c96e2b8
Revises: c1d5e83f4a29
"""

from typing import Sequence, Union

from alembic import op

revision: str = "d4a71c96e2b8"
down_revision: Union[str, Sequence[str], None] = "c1d5e83f4a29"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OPENS = "rooms_opens_at_check"
CLOSES = "rooms_closes_at_check"


def upgrade() -> None:
    op.drop_constraint(OPENS, "rooms", type_="check")
    op.drop_constraint(CLOSES, "rooms", type_="check")

    op.execute(
        "UPDATE rooms"
        " SET opens_at = date_trunc('hour', opens_at::interval) + interval '1 hour'"
        " WHERE date_part('minute', opens_at) <> 0"
    )
    op.execute(
        "UPDATE rooms SET closes_at = date_trunc('hour', closes_at::interval)"
        " WHERE date_part('minute', closes_at) <> 0"
    )
    # 30분짜리 방이었다면 위 두 줄이 여는 시각을 닫는 시각 뒤로 보낼 수 있다.
    # 그런 방은 한 시간으로 벌려 둔다 — 방을 지우는 것보다 낫다.
    op.execute(
        "UPDATE rooms SET closes_at = opens_at + interval '1 hour'"
        " WHERE closes_at <= opens_at"
    )

    op.create_check_constraint(
        OPENS,
        "rooms",
        "date_part('minute', opens_at) = 0 AND date_part('second', opens_at) = 0",
    )
    op.create_check_constraint(
        CLOSES,
        "rooms",
        "date_part('minute', closes_at) = 0 AND date_part('second', closes_at) = 0",
    )


def downgrade() -> None:
    # 정시는 30분 격자에도 들어맞아, 값은 그대로 두고 제약만 넓힌다.
    op.drop_constraint(OPENS, "rooms", type_="check")
    op.drop_constraint(CLOSES, "rooms", type_="check")
    op.create_check_constraint(
        OPENS,
        "rooms",
        "date_part('minute', opens_at) IN (0, 30) AND date_part('second', opens_at) = 0",
    )
    op.create_check_constraint(
        CLOSES,
        "rooms",
        "date_part('minute', closes_at) IN (0, 30) AND date_part('second', closes_at) = 0",
    )
