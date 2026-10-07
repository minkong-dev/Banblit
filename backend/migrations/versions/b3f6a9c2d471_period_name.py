"""기간에 공연명 열(name)을 추가합니다.

화면의 기간 목록 제목으로 쓰입니다. 이미 저장된 기간은 빈 문자열이고, 화면이 종류 이름을 대신 표시합니다.

Revision ID: b3f6a9c2d471
Revises: a4e7c2d91b58
Create Date: 2026-10-07
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3f6a9c2d471"
down_revision: Union[str, Sequence[str], None] = "a4e7c2d91b58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("periods", sa.Column("name", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("periods", "name")
