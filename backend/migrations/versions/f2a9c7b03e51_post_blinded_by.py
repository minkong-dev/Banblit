"""누가 가렸는지를 함께 저장합니다.

권한자가 여럿일 때 사후에 누가 처리했는지 확인하기 위해서입니다. 해제하면 시각과 함께 비웁니다.

가린 사람의 계정이 삭제되면 이 값만 비웁니다(ON DELETE SET NULL). 글 작성자(author_id)와 달리
CASCADE 로 두면 관리자 계정 하나를 지울 때 그 사람이 가린 글이 전부 삭제됩니다.

Revision ID: f2a9c7b03e51
Revises: e1f8b40c9d26
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "f2a9c7b03e51"
down_revision: Union[str, Sequence[str], None] = "e1f8b40c9d26"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("blinded_by_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "posts_blinded_by_id_fkey",
        "posts",
        "members",
        ["blinded_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("posts_blinded_by_id_fkey", "posts", type_="foreignkey")
    op.drop_column("posts", "blinded_by_id")
