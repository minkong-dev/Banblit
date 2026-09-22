"""로그인 아이디(login_id)를 이메일과 분리합니다.

지금까지 로그인 식별자는 email 이었습니다. 가입할 때 로그인 아이디를 따로 입력받고,
email 은 비밀번호 재설정·아이디 찾기 메일을 받는 주소로만 씁니다.

기존에 가입을 완료한 계정(password_hash 가 있는 행)에는 'user' + id 값을 임시로 채웁니다.
개발자가 이 작업 이후 가입 계정을 전부 지울 예정이라 실제 로그인에 쓰이지 않는 임시값입니다.
명단에만 있고 가입하지 않은 행은 email·password_hash 처럼 login_id 도 null 로 둡니다.

Revision ID: e9a1c6d0f2b3
Revises: d7c5b93e18a2
Create Date: 2026-09-22
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "e9a1c6d0f2b3"
down_revision: Union[str, Sequence[str], None] = "d7c5b93e18a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("members", sa.Column("login_id", sa.Text(), nullable=True))
    op.execute("UPDATE members SET login_id = 'user' || id WHERE password_hash IS NOT NULL")
    op.create_unique_constraint("members_login_id_key", "members", ["login_id"])


def downgrade() -> None:
    op.drop_constraint("members_login_id_key", "members", type_="unique")
    op.drop_column("members", "login_id")
