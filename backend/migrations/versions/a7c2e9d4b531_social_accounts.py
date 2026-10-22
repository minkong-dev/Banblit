"""멤버에 연결된 소셜 계정을 담는 social_accounts table 을 추가합니다.

provider 는 contract.py 의 SOCIAL_PROVIDERS(google, kakao) 중 하나이고, provider_user_id 는 제공자가 발급한
사용자 번호입니다. 소셜 계정 1개는 멤버 1명에게만, 멤버 1명은 제공자마다 1개만 연결합니다.

Revision ID: a7c2e9d4b531
Revises: b6f3d8a2c915
Create Date: 2026-10-22
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c2e9d4b531"
down_revision: Union[str, Sequence[str], None] = "b6f3d8a2c915"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "social_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("provider_user_id", sa.Text(), nullable=False),
        sa.Column("linked_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("provider", "provider_user_id"),
        sa.UniqueConstraint("member_id", "provider"),
        sa.CheckConstraint("provider IN ('google', 'kakao')", name="social_accounts_provider_check"),
    )


def downgrade() -> None:
    op.drop_table("social_accounts")
