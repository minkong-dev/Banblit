"""게시글을 지우지 않고 가리는 블라인드를 추가합니다.

값이 있으면 그 시각에 가려진 글이고, 비어 있으면 보이는 글입니다. 가려진 글은 작성자 본인도 볼 수 없고
board_moderate 를 가진 사람이 격리 목록에서만 봅니다. 댓글은 글에 딸린 것이라 따로 열을 두지 않습니다.

index 를 둡니다. 목록 조회가 전부 "가려지지 않은 것만" 조건을 붙이는데, 가려진 글이 전체의 일부라
부분 index 로 두면 그 조건을 만족하는 행만 담아 index 자체가 작습니다.

Revision ID: e1f8b40c9d26
Revises: d9a4c6e1f207
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f8b40c9d26"
down_revision: Union[str, Sequence[str], None] = "d9a4c6e1f207"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("blinded_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_posts_visible",
        "posts",
        ["team_id"],
        postgresql_where=sa.text("blinded_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_posts_visible", table_name="posts")
    op.drop_column("posts", "blinded_at")
