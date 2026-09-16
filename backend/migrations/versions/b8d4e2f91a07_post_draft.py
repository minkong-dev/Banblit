"""글을 쓰는 중인 초안 상태를 추가합니다.

본문에 파일을 드래그해 넣으려면 글 번호가 먼저 있어야 합니다. 첨부 업로드가
POST /posts/{id}/attachments 라, 글이 없으면 쓰는 중에 파일을 올릴 수 없습니다.
그래서 작성 페이지를 열 때 제목·본문이 빈 글을 먼저 만들고, 발행할 때 published_at 을 채웁니다.

이미 저장된 글은 전부 발행된 글이므로 created_at 을 published_at 에 복사합니다.

Revision ID: b8d4e2f91a07
Revises: a1f7c30e9b52
Create Date: 2026-09-16 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d4e2f91a07'
down_revision: Union[str, Sequence[str], None] = 'a1f7c30e9b52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VISIBLE = 'ix_posts_visible'


def upgrade() -> None:
    op.add_column('posts', sa.Column('published_at', sa.DateTime(), nullable=True))
    # 이미 있던 글은 전부 발행된 글입니다. 비워 두면 목록에서 전부 사라집니다.
    op.execute("UPDATE posts SET published_at = created_at")

    # 제목·본문이 비어 있을 수 있게 조건을 붙입니다. 초안일 때만 비는 것을 허용합니다.
    # 옛 제약은 migration 92d0d767d186 이 붙인 이름입니다.
    op.drop_constraint('posts_title_not_blank', 'posts', type_='check')
    op.drop_constraint('posts_body_not_blank', 'posts', type_='check')
    op.create_check_constraint(
        'posts_published_title', 'posts', "published_at IS NULL OR length(trim(title)) > 0"
    )
    op.create_check_constraint(
        'posts_published_body', 'posts', "published_at IS NULL OR length(trim(body)) > 0"
    )

    # 목록 조회가 초안도 제외하므로 부분 index 의 조건에 더합니다.
    op.drop_index(VISIBLE, table_name='posts')
    op.create_index(
        VISIBLE, 'posts', ['team_id'],
        postgresql_where=sa.text('blinded_at IS NULL AND published_at IS NOT NULL'),
    )


def downgrade() -> None:
    # 초안은 제목·본문이 비어 있어 옛 제약을 만족하지 못합니다. 되돌리기 전에 지웁니다.
    op.execute("DELETE FROM posts WHERE published_at IS NULL")

    op.drop_index(VISIBLE, table_name='posts')
    op.create_index(
        VISIBLE, 'posts', ['team_id'], postgresql_where=sa.text('blinded_at IS NULL')
    )
    op.drop_constraint('posts_published_body', 'posts', type_='check')
    op.drop_constraint('posts_published_title', 'posts', type_='check')
    op.create_check_constraint('posts_title_not_blank', 'posts', "length(trim(title)) > 0")
    op.create_check_constraint('posts_body_not_blank', 'posts', "length(trim(body)) > 0")
    op.drop_column('posts', 'published_at')
