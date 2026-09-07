"""팀 악기 자리와 기수

포지션 표 둘(positions·member_positions)과 소속 표(memberships)를 걷어내고, 팀이
악기 자리를 들고 그 자리에 사람이 앉는 team_slots 하나로 바꾼다. 사람에게는 기수를
더한다.

바꾸는 까닭은 포지션이 두 곳에 따로 있었기 때문이다 — 가입할 때 고르는 목록과 팀마다
맡는 것이 서로 다른 표였고, 둘 다 "이 팀에 일렉이 두 자리 있다"를 말하지 못했다.
자리를 팀이 들고 있으면 그 말이 그대로 표가 된다.

옮기는 규칙은 이렇다.
- 승인된 소속만 옮긴다. 대기 중이던 신청은 참가 신청 자체가 없어지므로 버린다.
- 포지션 이름을 악기로 바꾼다: 기타→일렉, 키보드→신디, 나머지는 그대로.
- 같은 팀 안에서 같은 악기가 여럿이면 소속이 만들어진 순서대로 1, 2, … 를 매긴다.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2d94f7a1c05"
down_revision: Union[str, Sequence[str], None] = "a3f8c50d1b64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INSTRUMENTS = ("보컬", "일렉", "통기타", "베이스", "신디", "드럼")
_INSTRUMENT_LIST = ", ".join(f"'{name}'" for name in INSTRUMENTS)

# 포지션 이름을 악기 이름으로. 옛 목록에 없던 통기타는 이 길로 생기지 않는다.
_TO_INSTRUMENT = "CASE p.name WHEN '기타' THEN '일렉' WHEN '키보드' THEN '신디' ELSE p.name END"

# 되돌릴 때 쓰는 반대 방향. 통기타는 옛 목록에 없어 기타로 합쳐진다.
_TO_POSITION = (
    "CASE s.instrument WHEN '일렉' THEN '기타' WHEN '통기타' THEN '기타' "
    "WHEN '신디' THEN '키보드' ELSE s.instrument END"
)


def upgrade() -> None:
    op.add_column("members", sa.Column("cohort", sa.Integer(), nullable=True))

    # 열을 지우면 그 열만 보는 CHECK 도 함께 사라지므로 제약을 따로 지우지 않는다.
    op.drop_column("teams", "join_policy")

    op.create_table(
        "team_slots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("instrument", sa.Text(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id", "instrument", "ordinal"),
        sa.UniqueConstraint("team_id", "member_id"),
        sa.CheckConstraint(f"instrument IN ({_INSTRUMENT_LIST})"),
        sa.CheckConstraint("ordinal >= 1"),
    )

    # 자리 번호는 소속이 만들어진 순서대로 매긴다 — 같은 팀·같은 악기 안에서만 센다.
    op.execute(
        f"""
        INSERT INTO team_slots (team_id, instrument, ordinal, member_id)
        SELECT team_id, instrument,
               ROW_NUMBER() OVER (PARTITION BY team_id, instrument ORDER BY id),
               member_id
        FROM (
            SELECT m.id, m.team_id, m.member_id, {_TO_INSTRUMENT} AS instrument
            FROM memberships m
            JOIN positions p ON p.id = m.position_id
            WHERE m.status = 'approved'
        ) mapped
        WHERE instrument IN ({_INSTRUMENT_LIST})
        """
    )

    op.drop_table("memberships")
    op.drop_table("member_positions")
    op.drop_table("positions")


def downgrade() -> None:
    op.create_table(
        "positions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.bulk_insert(
        sa.table("positions", sa.column("name", sa.Text())),
        [{"name": name} for name in ("보컬", "기타", "베이스", "드럼", "키보드")],
    )

    op.create_table(
        "member_positions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("position_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["position_id"], ["positions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_id", "position_id"),
    )

    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("position_id", sa.Integer(), nullable=False),
        sa.Column(
            "status", sa.Text(), nullable=False, server_default=sa.text("'approved'")
        ),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["position_id"], ["positions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("member_id", "team_id"),
        sa.CheckConstraint("status IN ('approved', 'pending')"),
    )

    # 아무도 앉지 않은 자리는 소속으로 되돌릴 수 없다 — 사람이 없는 소속은 없다.
    op.execute(
        f"""
        INSERT INTO memberships (member_id, team_id, position_id, status)
        SELECT s.member_id, s.team_id, p.id, 'approved'
        FROM team_slots s
        JOIN positions p ON p.name = {_TO_POSITION}
        WHERE s.member_id IS NOT NULL
        """
    )

    op.drop_table("team_slots")

    op.add_column(
        "teams",
        sa.Column("join_policy", sa.Text(), nullable=False, server_default="auto"),
    )
    op.create_check_constraint(
        "teams_join_policy_check", "teams", "join_policy IN ('auto', 'approval')"
    )

    op.drop_column("members", "cohort")
