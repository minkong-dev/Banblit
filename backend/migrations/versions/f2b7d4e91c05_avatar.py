"""프로필 사진의 저장 파일명을 담을 열(avatar)을 추가합니다.

사진 파일은 게시판 첨부와 같은 폴더(ATTACHMENT_DIR)에 저장하고, 이 열에는 그 폴더 안의
파일명만 담습니다. 사진이 없는 계정은 null 입니다.

Revision ID: f2b7d4e91c05
Revises: e9a1c6d0f2b3
Create Date: 2026-09-23
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2b7d4e91c05"
down_revision: Union[str, Sequence[str], None] = "e9a1c6d0f2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("members", sa.Column("avatar", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("members", "avatar")
