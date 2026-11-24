import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL, make_url

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False)

    # Desktop workspaces default to a durable per-user SQLite file. Server
    # deployments can select PostgreSQL, Oracle, or provide DATABASE_URL.
    database_mode: str = "local"
    database_url: str | None = Field(default=None, repr=False)
    data_dir: Path = Field(default_factory=lambda: Path(
        os.environ.get("REQTRACE_DATA_DIR")
        or (Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local")) / "ReqTrace" / "data")
    ))
    postgres_user: str = "reqtrace"
    postgres_password: str = Field(default="", repr=False)
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    postgres_database: str = "reqtrace"
    oracle_user: str = "REQTRACE_APP"
    oracle_password: str = Field(default="", repr=False)
    oracle_host: str = "127.0.0.1"
    oracle_port: int = 1521
    oracle_service: str = "XE"
    oracle_client_lib_dir: str | None = None
    oracle_config_dir: str | None = None
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    local_api_token: str = Field(
        default_factory=lambda: os.environ.get("REQTRACE_LOCAL_API_TOKEN", ""),
        repr=False,
    )
    cors_allowed_origins: list[str] = Field(default_factory=lambda: [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://tauri.localhost",
        "tauri://localhost",
    ])
    auth_required: bool | None = None
    auth_token_secret: str = Field(default="", repr=False)
    auth_token_ttl_minutes: int = 60
    auth_bootstrap_email: str = ""
    auth_bootstrap_password: str = Field(default="", repr=False)
    ai_api_key: str = Field(default="", repr=False)
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    github_token: str = Field(default="", repr=False)
    github_api_url: str = "https://api.github.com"

    @property
    def authentication_enabled(self) -> bool:
        if self.auth_required is not None:
            return self.auth_required
        mode = self.database_mode.casefold()
        if mode in {"oracle", "postgres", "postgresql"}:
            return True
        if self.database_url:
            url = make_url(self._normalize_database_url(self.database_url))
            return url.get_backend_name() in {"oracle", "postgresql"}
        return False

    @property
    def resolved_database_url(self) -> str | URL:
        if self.database_url:
            normalized_url = self._normalize_database_url(self.database_url)
            url = make_url(normalized_url)
            if url.get_backend_name() == "postgresql" and url.drivername == "postgresql":
                url = url.set(drivername="postgresql+psycopg")
            return url
        mode = self.database_mode.casefold()
        if mode == "oracle":
            return URL.create(
                "oracle+oracledb",
                username=self.oracle_user,
                password=self.oracle_password,
                host=self.oracle_host,
                port=self.oracle_port,
                query={"service_name": self.oracle_service},
            )
        if mode in {"postgres", "postgresql"}:
            return URL.create(
                "postgresql+psycopg",
                username=self.postgres_user,
                password=self.postgres_password,
                host=self.postgres_host,
                port=self.postgres_port,
                database=self.postgres_database,
            )
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return URL.create("sqlite", database=str(self.data_dir / "reqtrace.db"))

    @staticmethod
    def _normalize_database_url(value: str) -> str:
        # `postgres://` is used by some providers as an alias for PostgreSQL.
        if value.startswith("postgres://"):
            return "postgresql://" + value[len("postgres://"):]
        return value


settings = Settings()
