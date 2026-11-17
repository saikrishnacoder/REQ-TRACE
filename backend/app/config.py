import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False)

    # Desktop workspaces default to a durable per-user SQLite file. A deployed
    # team API sets DATABASE_URL to the Oracle database connection string.
    database_mode: str = "local"
    database_url: str | None = Field(default=None, repr=False)
    data_dir: Path = Field(default_factory=lambda: Path(
        os.environ.get("REQTRACE_DATA_DIR")
        or (Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local")) / "ReqTrace" / "data")
    ))
    oracle_user: str = "REQTRACE_APP"
    oracle_password: str = Field(default="", repr=False)
    oracle_host: str = "127.0.0.1"
    oracle_port: int = 1521
    oracle_service: str = "XE"
    oracle_client_lib_dir: str | None = None
    oracle_config_dir: str | None = None
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    @property
    def resolved_database_url(self) -> str | URL:
        if self.database_url:
            return self.database_url
        if self.database_mode.casefold() == "oracle":
            return URL.create(
                "oracle+oracledb",
                username=self.oracle_user,
                password=self.oracle_password,
                host=self.oracle_host,
                port=self.oracle_port,
                query={"service_name": self.oracle_service},
            )
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return URL.create("sqlite", database=str(self.data_dir / "reqtrace.db"))


settings = Settings()
