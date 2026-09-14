"""팀 포지션 자리(team_slots)와 기수(cohort)를 추가합니다.

포지션 table 둘(positions·member_positions)과 소속 table(memberships)을 삭제하고,
팀이 포지션 자리를 관리하며 그 자리에 멤버가 배정되는 team_slots 하나로 변경합니다.
멤버에는 기수를 추가합니다.

변경하는 이유는 포지션이 두 곳에 따로 있었기 때문입니다. 가입할 때 선택하는 목록과
팀별로 관리하는 목록이 서로 다른 table 이었고, 둘 다 "이 팀에 일렉 자리가 2개
있다"를 표현하지 못했습니다. 자리를 팀이 관리하면 그 구조를 table 이 그대로 표현합니다.

이행 규칙은 다음과 같습니다.
- 승인된 소속만 이행합니다. 대기 중이던 신청은 참가 신청 자체가 없어지므로 삭제합니다.
- 옛 포지션 이름을 새 포지션 이름으로 변경합니다: 기타→일렉, 키보드→신디, 나머지는 유지합니다.
- 같은 팀에서 같은 포지션이 2명 이상이면 소속이 생성된 순서대로 1, 2, … 를 부여합니다.
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

# 옛 포지션 이름을 새 포지션 이름으로 변환합니다. 옛 목록에 없던 통기타는 이 경로로 생기지 않습니다.
_TO_INSTRUMENT = "CASE p.name WHEN '기타' THEN '일렉' WHEN '키보드' THEN '신디' ELSE p.name END"

# downgrade() 에서 사용하는 역방향 변환입니다. 통기타는 옛 목록에 없어 기타로 통합됩니다.
_TO_POSITION = (
    "CASE s.instrument WHEN '일렉' THEN '기타' WHEN '통기타' THEN '기타' "
    "WHEN '신디' THEN '키보드' ELSE s.instrument END"
)


def upgrade() -> None:
    op.add_column("members", sa.Column("cohort", sa.Integer(), nullable=True))

    # column 을 삭제하면 그 column 을 참조하는 CHECK constraint 도 함께 삭제되므로
    # 제약을 따로 삭제하지 않습니다.
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

    # 자리 번호는 소속이 생성된 순서대로 부여합니다. 같은 팀·같은 포지션 범위 내에서만 계산합니다.
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
        sa.CheckConstraint(
            "status IN ('approved', 'pending')", name="memberships_status_valid"
        ),
    )

    # 아무도 배정되지 않은 자리는 소속으로 복원할 수 없습니다. 멤버가 없는 소속은
    # 존재하지 않기 때문입니다.
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
    # 이름은 c4a7d2e91b83 revision의 downgrade() 에서 삭제하는 constraint 이름과
    # 같아야 합니다.
    op.create_check_constraint(
        "teams_join_policy_valid", "teams", "join_policy IN ('auto', 'approval')"
    )

    op.drop_column("members", "cohort")
