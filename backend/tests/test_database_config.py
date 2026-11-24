import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import URL
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from app.config import Settings
from app.models import Base


def test_local_mode_uses_the_durable_sqlite_data_directory(tmp_path) -> None:
    settings = Settings(database_mode="local", data_dir=tmp_path)

    url = settings.resolved_database_url
    assert isinstance(url, URL)
    assert url.drivername == "sqlite"
    assert url.database == str(tmp_path / "reqtrace.db")
    assert tmp_path.is_dir()
    assert settings.authentication_enabled is False


def test_postgresql_mode_builds_a_psycopg_url() -> None:
    settings = Settings(
        database_mode="postgresql",
        postgres_user="reqtrace_user",
        postgres_password="test-password",
        postgres_host="db.example.test",
        postgres_port=5433,
        postgres_database="reqtrace_db",
    )

    url = settings.resolved_database_url
    assert isinstance(url, URL)
    assert url.drivername == "postgresql+psycopg"
    assert url.username == "reqtrace_user"
    assert url.password == "test-password"
    assert url.host == "db.example.test"
    assert url.port == 5433
    assert url.database == "reqtrace_db"
    assert settings.authentication_enabled is True


def test_postgresql_database_url_alias_uses_psycopg() -> None:
    settings = Settings(database_url="postgres://reqtrace:secret@db.example.test/reqtrace")
    url = settings.resolved_database_url

    assert isinstance(url, URL)
    assert url.drivername == "postgresql+psycopg"
    assert url.host == "db.example.test"
    assert url.database == "reqtrace"
    assert settings.authentication_enabled is True


def test_all_mapped_tables_compile_for_postgresql() -> None:
    dialect = postgresql.dialect()
    for table in Base.metadata.sorted_tables:
        statement = str(CreateTable(table).compile(dialect=dialect))
        assert f'CREATE TABLE "{table.name}"' in statement


def test_postgresql_offline_migrations_compile_without_duplicate_tables() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["DATABASE_MODE"] = "postgresql"
    env.pop("DATABASE_URL", None)
    script = """
import io
from alembic import command
from alembic.config import Config
output = io.StringIO()
command.upgrade(Config('alembic.ini', output_buffer=output), 'head', sql=True)
print(output.getvalue())
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=backend_dir,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr

    quote = chr(34)
    tables = [
        line.split(quote)[1]
        for line in result.stdout.splitlines()
        if line.startswith(f"CREATE TABLE {quote}")
    ]
    assert len(tables) == len(set(tables))
    assert "RT_PROJECTS" in tables
    assert "RT_PROJECT_MEMBERS" in tables
    assert "20261118_0012" in result.stdout
