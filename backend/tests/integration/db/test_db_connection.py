from sqlalchemy import text

from backend.db.pipeline import get_engine


def test_database_answers_select_one() -> None:
    engine = get_engine()
    with engine.connect() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1
