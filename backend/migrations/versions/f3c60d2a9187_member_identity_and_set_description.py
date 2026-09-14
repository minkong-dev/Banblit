"""멤버를 식별하는 값에 학과·학번을 추가하고 permission set(권한 집합)에 설명을 추가합니다.

멤버를 구분하는 값은 이름·학과·학번·기수 4가지입니다(사용자 결정). 이 조합에 unique
제약 조건을 설정해 같은 멤버가 중복으로 등록되지 않도록 합니다. 이름 하나로는 동명이인이
구분되지 않습니다.

permission set 에 설명을 추가합니다. 항목 목록만으로는 "왜 이 permission set 이 필요한가"를 알 수 없습니다.
기존 permission set 은 빈 문자열로 채웁니다. 설명을 임의로 작성하지 않습니다.

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
    # 이 제약 조건이 추가되기 전에 저장된 행은 학과·학번이 NULL입니다. PostgreSQL은
    # NULL을 포함한 조합을 중복으로 보지 않으므로 기존 행들이 제약 조건 위반으로
    # 충돌하지 않습니다.
    op.create_unique_constraint(
        IDENTITY, "members", ["name", "department", "student_no", "cohort"]
    )

    op.add_column(
        "permission_sets",
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )
    # 기본값은 기존 행을 채우기 위한 것입니다. 향후 추가되는 행은 서버가 반드시 값을
    # 제공하므로 기본값을 유지할 필요가 없습니다.
    op.alter_column("permission_sets", "description", server_default=None)


def downgrade() -> None:
    op.drop_column("permission_sets", "description")
    op.drop_constraint(IDENTITY, "members", type_="unique")
    op.drop_column("members", "student_no")
    op.drop_column("members", "department")
