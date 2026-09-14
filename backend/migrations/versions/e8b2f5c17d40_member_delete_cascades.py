"""멤버를 삭제하면 그 멤버가 작성한 게시글·댓글·예약도 함께 삭제합니다.

게시글·댓글·예약이 멤버를 foreign key(다른 table의 행을 참조하는 제약 조건)로 참조하고 있어
RESTRICT 규칙이 적용되면 멤버 삭제 자체가 차단됩니다. 멤버 데이터를 보존하면 글을 작성한
멤버가 없는 상태가 되고 표시명을 어떻게 할지를 또 정해야 하므로, 멤버 삭제 시 연결된
데이터를 모두 삭제하는 쪽으로 정했습니다(사용자 결정).

Revision ID: e8b2f5c17d40
Revises: d4a71c96e2b8
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e8b2f5c17d40"
down_revision: Union[str, Sequence[str], None] = "d4a71c96e2b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (제약 조건 이름, table, 열)
LINKS = (
    ("posts_author_id_fkey", "posts", "author_id"),
    ("comments_author_id_fkey", "comments", "author_id"),
    ("reservations_member_id_fkey", "reservations", "member_id"),
)


def _relink(rule: str) -> None:
    for name, table, column in LINKS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, "members", [column], ["id"], ondelete=rule)


def upgrade() -> None:
    _relink("CASCADE")


def downgrade() -> None:
    _relink("RESTRICT")
