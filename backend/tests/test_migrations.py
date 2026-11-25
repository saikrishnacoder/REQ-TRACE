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
    assert {"RT_PROJECTS", "RT_REQUIREMENTS", "RT_SOURCE_DOCUMENTS", "RT_AUDIT_EVENTS", "RT_SYNC_OUTBOX", "RT_REQUIREMENT_LINKS", "RT_USERS", "RT_PROJECT_MEMBERS", "RT_ACCOUNT_SECURITY_EVENTS", "RT_PASSWORD_RESET_TOKENS", "alembic_version"} <= tables
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
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "20261125_0015"
        assert {"RT_USERS", "RT_PROJECT_MEMBERS", "RT_WORKSPACES", "RT_WORKSPACE_MEMBERS", "RT_SOURCE_DOCUMENTS", "RT_ACCOUNT_SECURITY_EVENTS", "RT_PASSWORD_RESET_TOKENS"} <= set(inspect(engine).get_table_names())
        assert connection.execute(text("SELECT WORKSPACE_ID FROM RT_PROJECTS WHERE PROJECT_ID='legacy-project'")).scalar_one() == "default-workspace"
        assert "token_version" in {column["name"].casefold() for column in inspect(engine).get_columns("RT_USERS")}
        assert "actor_user_id" in {column["name"].casefold() for column in inspect(engine).get_columns("RT_AUDIT_EVENTS")}
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
        assert "source_document_id" in columns
        assert connection.execute(text("SELECT NAME FROM RT_PROJECTS WHERE PROJECT_ID='legacy-project'")).scalar_one() == "Legacy"
    engine.dispose()


def test_upgrade_adds_source_document_support_to_existing_schema(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'pre-documents.db').as_posix()}")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE RT_PROJECTS (PROJECT_ID VARCHAR(36) PRIMARY KEY)")
        connection.exec_driver_sql("CREATE TABLE RT_REQUIREMENTS (REQUIREMENT_ID VARCHAR(36) PRIMARY KEY, PROJECT_ID VARCHAR(36) NOT NULL REFERENCES RT_PROJECTS(PROJECT_ID))")

    upgrade_on(engine)

    assert "RT_SOURCE_DOCUMENTS" in inspect(engine).get_table_names()
    columns = {column["name"].casefold() for column in inspect(engine).get_columns("RT_REQUIREMENTS")}
    assert "source_document_id" in columns
    foreign_keys = inspect(engine).get_foreign_keys("RT_REQUIREMENTS")
    assert any("RT_SOURCE_DOCUMENTS" == key["referred_table"] for key in foreign_keys)
    engine.dispose()
