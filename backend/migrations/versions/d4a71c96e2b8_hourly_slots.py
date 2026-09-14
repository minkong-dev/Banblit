"""slot(1시간 단위 시간 칸) 단위를 30분에서 1시간으로 변경합니다.

사용자의 결정입니다. 합주실의 시작시간과 종료시간을 정시(분·초가 0)에만 설정할 수 있도록 제약을 좁혔습니다.

30분 단위로 설정된 기존 값은 새 제약에 충돌하므로 함께 수정합니다. 시작시간은 다음 정시로 올리고, 종료시간은 이전 정시로 내립니다. 어느 쪽이든 시간 공백이 생기지 않는 방향입니다.

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
    # 30분 구간의 합주실이면 위의 수정으로 시작시간이 종료시간보다 뒤가 될 수 있습니다.
    # 이 경우 종료시간을 시작시간으로부터 1시간 뒤로 설정합니다. 합주실을 삭제하는 것보다 낫습니다.
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
    # 정시(분이 0)는 30분 격자에도 일치하므로, 값은 그대로 두고 제약만 다시 설정합니다.
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
