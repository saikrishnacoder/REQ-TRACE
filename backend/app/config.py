import os
from pathlib import Path
from urllib.parse import urlsplit

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
    rate_limit_redis_url: str = Field(default="", repr=False)
    public_api_origin: str = ""
    public_app_origin: str = ""
    enable_api_docs: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = Field(default="", repr=False)
    smtp_from: str = ""
    smtp_use_ssl: bool = False
    smtp_starttls: bool = True
    ai_api_key: str = Field(default="", repr=False)
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    github_token: str = Field(default="", repr=False)
    github_api_url: str = "https://api.github.com"

    @property
    def is_public_deployment(self) -> bool:
        return self.is_serverless or self.api_host.casefold() not in {"127.0.0.1", "localhost", "::1", "[::1]"}

    @property
    def is_serverless(self) -> bool:
        return any(os.environ.get(name) for name in ("VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "FUNCTIONS_WORKER_RUNTIME"))

    @property
    def storage_kind(self) -> str:
        mode = self.database_mode.casefold()
        if self.database_url:
            return "persistent" if make_url(self._normalize_database_url(self.database_url)).get_backend_name() != "sqlite" else ("ephemeral" if self.is_serverless else "persistent")
        if mode in {"postgres", "postgresql", "oracle"}:
            return "persistent"
        return "ephemeral" if self.is_serverless else "persistent"

    def validate_deployment_security(self) -> None:
        """Fail closed when configured to listen beyond the local machine."""
        if not self.is_public_deployment:
            return
        if not self.authentication_enabled:
            raise RuntimeError("Authentication must be enabled before binding the API to a non-loopback interface")
        if self.local_api_token:
            raise RuntimeError("REQTRACE_LOCAL_API_TOKEN is for the desktop sidecar and must not be configured on a hosted API")
        if len(self.auth_token_secret) < 32 or "replace-with" in self.auth_token_secret.casefold():
            raise RuntimeError("AUTH_TOKEN_SECRET must be a non-placeholder secret of at least 32 characters")
        database_url = self.resolved_database_url
        database = make_url(database_url) if isinstance(database_url, str) else database_url
        if self.storage_kind != "persistent" or database.get_backend_name() not in {"postgresql", "oracle"}:
            raise RuntimeError("A persistent PostgreSQL or Oracle database is required for public deployments; serverless SQLite is ephemeral")
        if database.get_backend_name() == "postgresql" and database.query.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
            raise RuntimeError("DATABASE_URL must require TLS with sslmode=require (or stronger)")
        for name, value in (("PUBLIC_API_ORIGIN", self.public_api_origin), ("PUBLIC_APP_ORIGIN", self.public_app_origin)):
            parsed = urlsplit(value.strip())
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
                raise RuntimeError(f"{name} must be an HTTPS origin without credentials, path, query, or fragment")
        origins = [origin.strip() for origin in self.cors_allowed_origins]
        parsed_origins = [urlsplit(origin) for origin in origins]
        if not origins or any(
            origin == "*" or parsed.scheme != "https" or not parsed.hostname
            or parsed.username or parsed.password or parsed.path not in {"", "/"}
            or parsed.query or parsed.fragment
            for origin, parsed in zip(origins, parsed_origins)
        ):
            raise RuntimeError("CORS_ALLOWED_ORIGINS must contain only explicit HTTPS origins for a public deployment")
        if self.public_app_origin.rstrip("/") not in {origin.rstrip("/") for origin in origins}:
            raise RuntimeError("CORS_ALLOWED_ORIGINS must include PUBLIC_APP_ORIGIN")
        if not self.rate_limit_redis_url.startswith("rediss://"):
            raise RuntimeError("A TLS-protected RATE_LIMIT_REDIS_URL (rediss://) is required for public deployments")
        if not self.smtp_host or not self.smtp_from or not (self.smtp_use_ssl or self.smtp_starttls):
            raise RuntimeError("TLS-enabled SMTP_HOST and SMTP_FROM are required for public account recovery")

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
        if self.is_serverless:
            # Serverless disks are disposable. Keep import safe and report that
            # fact to the client instead of trying to create a home directory.
            return URL.create("sqlite", database="/tmp/reqtrace-ephemeral.db")
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return URL.create("sqlite", database=str(self.data_dir / "reqtrace.db"))

    @staticmethod
    def _normalize_database_url(value: str) -> str:
        # `postgres://` is used by some providers as an alias for PostgreSQL.
        if value.startswith("postgres://"):
            return "postgresql://" + value[len("postgres://"):]
        return value


settings = Settings()
