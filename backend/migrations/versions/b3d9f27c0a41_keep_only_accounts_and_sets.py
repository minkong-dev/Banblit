"""가입한 계정과 permission set(권한 집합)만 남기고 나머지 데이터를 전부 지웁니다.

구조를 크게 바꾸기 전에 데이터를 한 번 비우되, 사람들이 다시 가입하지 않아도 되도록
계정과 권한만 남기는 임시 migration 입니다. 구조 변경이 끝나면 되돌릴 수 없는 이 파일을
저장소에서 지웁니다.

Revision ID: b3d9f27c0a41
Revises: e5b7c2a94d18
Create Date: 2026-09-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b3d9f27c0a41'
down_revision: Union[str, Sequence[str], None] = 'e5b7c2a94d18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 남기는 것은 members, permission_sets, member_permission_sets 셋뿐이고 나머지는 전부 비웁니다.
# 합주실도 지웁니다. 사람과 권한 집합만 남긴다는 결정에 합주실은 들어 있지 않습니다.
WIPED = (
    'assignment_backups',
    'assignments',
    'assignment_runs',
    'attachments',
    'comments',
    'notifications',
    'password_reset_tokens',
    'periods',
    'posts',
    'reservations',
    'rooms',
    'sessions',
    'team_slots',
    'teams',
    'unavailable_times',
)


def upgrade() -> None:
    # TRUNCATE 는 DELETE 와 달리 행을 하나씩 훑지 않아 빠르고, CASCADE 가 이 table 들을
    # 가리키는 다른 table 까지 함께 비웁니다. members 와 permission_sets 는 이 목록의
    # 어느 table 도 가리키지 않으므로 CASCADE 가 닿지 않습니다.
    # RESTART IDENTITY 는 id 를 1번부터 다시 시작하게 합니다.
    op.execute(
        f"TRUNCATE {', '.join(WIPED)} RESTART IDENTITY CASCADE"
    )

    # 명단에만 올라 있고 가입한 적 없는 행을 지웁니다. password_hash 가 비어 있는 행이
    # 그것입니다(banblit.sh 의 show_account_hint 가 같은 기준으로 셉니다).
    # member_permission_sets 는 members 를 함께 삭제하도록 되어 있어 따로 지우지 않습니다.
    op.execute("DELETE FROM members WHERE password_hash IS NULL")


def downgrade() -> None:
    # 지운 데이터를 되돌릴 방법이 없습니다. 되돌리려면 백업에서 복원해야 합니다
    # (COMMAND.md 의 "백업으로 복원하기").
    pass
