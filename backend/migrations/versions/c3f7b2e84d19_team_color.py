"""팀에 색을 저장합니다(patch_note 10번).

지금까지는 화면이 팀 목록에서의 위치로 4색을 돌려썼습니다. 팀이 5개면 1번 팀과 색이 같아지고, 앞 팀을
삭제하면 뒤 팀 색이 한 칸씩 밀렸습니다. 이제 팀마다 20색 중 하나를 저장하고 다른 팀과 겹칠 수 없게 합니다.

색을 고르지 않고 만든 팀에는 BEFORE INSERT 트리거가 다른 팀이 쓰지 않는 첫 색을 채웁니다. 앱 코드에서
고르게 하면 팀을 INSERT 하는 모든 곳(서비스·스크립트·테스트)이 색을 알아야 합니다.

Revision ID: c3f7b2e84d19
Revises: a8d3e61f5c27
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f7b2e84d19"
down_revision: Union[str, Sequence[str], None] = "a8d3e61f5c27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 이 시점의 팀 색입니다. migration 은 지나간 시점을 그대로 재현해야 하므로 db/models.py 를 참조하지 않습니다.
TEAM_COLORS = (
    "tomato", "red", "crimson", "pink", "plum", "purple", "iris", "indigo", "blue", "sky",
    "teal", "jade", "green", "mint", "lime", "yellow", "amber", "orange", "gold", "brown",
)
PALETTE = "ARRAY[{}]::text[]".format(", ".join(f"'{name}'" for name in TEAM_COLORS))


def upgrade() -> None:
    op.add_column("teams", sa.Column("color", sa.Text(), nullable=True))
    # 이미 있는 팀에 id 순서대로 색을 줍니다. 팀이 20개를 넘으면 21번째부터 색이 비어 아래 NOT NULL 에서
    # migration 이 멈춥니다. 그때는 팀을 정리한 뒤 다시 실행합니다.
    op.execute(
        "UPDATE teams SET color = palette.c"
        " FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM teams) AS ranked,"
        f" unnest({PALETTE}) WITH ORDINALITY AS palette(c, i)"
        " WHERE teams.id = ranked.id AND palette.i = ranked.n"
    )
    op.alter_column("teams", "color", nullable=False)
    op.create_unique_constraint("teams_color_key", "teams", ["color"])
    op.create_check_constraint("teams_color_valid", "teams", f"color = ANY ({PALETTE})")

    # plpgsql 함수는 VOLATILE 이라 같은 INSERT 문의 앞 행이 넣은 색도 보고 고릅니다. 남은 색이 없으면
    # 제약 이름(teams_color_exhausted)을 붙여 거절합니다. 이름 없이 NOT NULL 에 걸리게 두면 서버가 문장으로
    # 바꿀 수 없어 500 이 됩니다. ERRCODE check_violation 은 23 계열이라 드라이버가 IntegrityError 로 올립니다.
    op.execute(
        "CREATE FUNCTION teams_pick_color() RETURNS trigger LANGUAGE plpgsql AS $$"
        " BEGIN"
        "   IF NEW.color IS NULL THEN"
        "     SELECT palette.c INTO NEW.color"
        f"    FROM unnest({PALETTE}) WITH ORDINALITY AS palette(c, i)"
        "     WHERE NOT EXISTS (SELECT 1 FROM teams WHERE teams.color = palette.c)"
        "     ORDER BY palette.i LIMIT 1;"
        "     IF NEW.color IS NULL THEN"
        "       RAISE EXCEPTION 'no free team color'"
        "         USING ERRCODE = 'check_violation', CONSTRAINT = 'teams_color_exhausted';"
        "     END IF;"
        "   END IF;"
        "   RETURN NEW;"
        " END $$"
    )
    op.execute(
        "CREATE TRIGGER teams_pick_color BEFORE INSERT ON teams"
        " FOR EACH ROW EXECUTE FUNCTION teams_pick_color()"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS teams_pick_color ON teams")
    op.execute("DROP FUNCTION IF EXISTS teams_pick_color()")
    op.drop_constraint("teams_color_valid", "teams", type_="check")
    op.drop_constraint("teams_color_key", "teams", type_="unique")
    op.drop_column("teams", "color")
