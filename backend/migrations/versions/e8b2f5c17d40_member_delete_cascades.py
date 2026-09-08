"""사람을 지우면 그 사람이 남긴 것도 함께 지운다

글·댓글·예약이 사람을 붙들고 있어(RESTRICT) 탈퇴 자체가 막혀 있었다. 남겨 두면
쓴 사람이 없는 글이 되고 이름 자리에 무엇을 적을지를 또 정해야 하므로, 통째로
지우는 쪽으로 정했다(사용자 결정).

Revision ID: e8b2f5c17d40
Revises: d4a71c96e2b8
"""

from typing import Sequence, Union

from alembic import op

revision: str = "e8b2f5c17d40"
down_revision: Union[str, Sequence[str], None] = "d4a71c96e2b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (제약 이름, 표, 열)
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
