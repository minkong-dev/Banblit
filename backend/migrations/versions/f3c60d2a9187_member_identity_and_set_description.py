"""사람을 가르는 값에 학과·학번을 더하고, 권한에 설명을 둔다

사람이 사람을 가르는 값은 이름·학과·학번·기수 네 가지다(사용자 결정). 그 조합에
고유 조건을 걸어 같은 사람이 두 번 들어오지 않게 한다. 이름 하나로는 동명이인이
갈리지 않는다.

권한 묶음에는 설명을 둔다. 항목 목록만으로는 "왜 이 묶음이 있는가"가 남지 않는다.
이미 있던 묶음은 빈 문자열로 채운다 — 뜻을 지어내지 않는다.

Revision ID: f3c60d2a9187
Revises: e8b2f5c17d40
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3c60d2a9187"
down_revision: Union[str, Sequence[str], None] = "e8b2f5c17d40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

IDENTITY = "members_name_department_student_no_cohort_key"


def upgrade() -> None:
    op.add_column("members", sa.Column("department", sa.Text(), nullable=True))
    op.add_column("members", sa.Column("student_no", sa.Text(), nullable=True))
    # 이 조건이 생기기 전에 들어온 행은 학과·학번이 비어 있다. Postgres 는 NULL 이 낀
    # 조합을 겹침으로 보지 않으므로, 옛 행들끼리 부딪히지 않는다.
    op.create_unique_constraint(
        IDENTITY, "members", ["name", "department", "student_no", "cohort"]
    )

    op.add_column(
        "permission_sets",
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )
    # 기본값은 옛 행을 채우기 위한 것이다. 앞으로 들어오는 행은 서버가 반드시 값을
    # 실어 보내므로 기본값을 남겨 둘 이유가 없다.
    op.alter_column("permission_sets", "description", server_default=None)


def downgrade() -> None:
    op.drop_column("permission_sets", "description")
    op.drop_constraint(IDENTITY, "members", type_="unique")
    op.drop_column("members", "student_no")
    op.drop_column("members", "department")
