from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app import models  # noqa: F401 - register ORM models
from app.database import Base

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def upgrade_on(engine) -> None:
    config = Config(str(ALEMBIC_INI))
    with engine.connect() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def test_upgrade_creates_a_fresh_schema(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}")
    upgrade_on(engine)

    tables = set(inspect(engine).get_table_names())
    assert {"RT_PROJECTS", "RT_REQUIREMENTS", "RT_AUDIT_EVENTS", "RT_SYNC_OUTBOX", "RT_REQUIREMENT_LINKS", "alembic_version"} <= tables
    engine.dispose()


def test_upgrade_preserves_data_from_create_all_schema(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'existing.db').as_posix()}")
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        session.add(models.Project(id="legacy-project", name="Legacy", key="LEGACY", description="keep"))
        session.commit()

    upgrade_on(engine)

    with engine.connect() as connection:
        assert connection.execute(text("SELECT NAME FROM RT_PROJECTS WHERE PROJECT_ID='legacy-project'")).scalar_one() == "Legacy"
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20261117_0004"
    engine.dispose()


def test_upgrade_adds_soft_delete_column_to_existing_schema(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'pre-delete.db').as_posix()}")
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        session.add(models.Project(id="legacy-project", name="Legacy", key="LEGACY", description="keep"))
        session.commit()
    with engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE RT_REQUIREMENTS DROP COLUMN DELETED_AT")

    upgrade_on(engine)

    columns = {column["name"].casefold() for column in inspect(engine).get_columns("RT_REQUIREMENTS")}
    with engine.connect() as connection:
        assert "deleted_at" in columns
        assert connection.execute(text("SELECT NAME FROM RT_PROJECTS WHERE PROJECT_ID='legacy-project'")).scalar_one() == "Legacy"
    engine.dispose()
