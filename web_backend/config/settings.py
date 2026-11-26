"""Environment-driven settings for the hosted Django API."""
import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    return default if value is None else value.strip().casefold() in {"1", "true", "yes", "on"}


def env_list(name: str, default: tuple[str, ...] = ()) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return list(default)
    if raw.startswith("["):
        import json
        try:
            result = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ImproperlyConfigured(f"{name} must be a JSON array or comma-separated list") from exc
        if not isinstance(result, list) or not all(isinstance(item, str) for item in result):
            raise ImproperlyConfigured(f"{name} must be a list of strings")
        return [item.strip() for item in result if item.strip()]
    return [item.strip() for item in raw.split(",") if item.strip()]


def database_config(raw_url: str | None, *, debug: bool) -> dict:
    if not raw_url:
        if not debug:
            raise ImproperlyConfigured("SPECFORGE_DATABASE_URL is required outside development")
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / ".local.sqlite3"}

    parsed = urlsplit(raw_url)
    if parsed.scheme in {"mysql", "mysql2"}:
        if not parsed.hostname or not parsed.path.strip("/"):
            raise ImproperlyConfigured("SPECFORGE_DATABASE_URL must include a MySQL host and database name")
        query = parse_qs(parsed.query)
        options: dict[str, object] = {"charset": "utf8mb4", "init_command": "SET sql_mode='STRICT_TRANS_TABLES'"}
        ssl_ca = os.environ.get("MYSQL_SSL_CA", "").strip()
        if os.environ.get("DJANGO_ENV", "development").strip().casefold() == "production" and not ssl_ca:
            raise ImproperlyConfigured("MYSQL_SSL_CA must point to the trusted CA certificate in production")
        if ssl_ca:
            options["ssl"] = {"ca": ssl_ca}
        return {
            "ENGINE": "django.db.backends.mysql",
            "NAME": unquote(parsed.path.lstrip("/")),
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname,
            "PORT": str(parsed.port or 3306),
            "OPTIONS": options,
            "CONN_MAX_AGE": int(os.environ.get("DJANGO_DB_CONN_MAX_AGE", "0" if os.environ.get("VERCEL") else "60")),
            "CONN_HEALTH_CHECKS": True,
        }
    if parsed.scheme in {"sqlite", "sqlite3"} and debug:
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": unquote(parsed.path)}
    raise ImproperlyConfigured("SPECFORGE_DATABASE_URL must use MySQL; SQLite is allowed only in development")


DEBUG = env_bool("DJANGO_DEBUG", default=True)
DEPLOYMENT_ENV = os.environ.get("DJANGO_ENV", "development").strip().casefold()
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-specforge-key-change-before-deploy")
if DEPLOYMENT_ENV == "production":
    if DEBUG:
        raise ImproperlyConfigured("DJANGO_DEBUG must be false in production")
    if len(SECRET_KEY) < 40 or SECRET_KEY.startswith("dev-only-"):
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be a unique secret of at least 40 characters")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ("localhost", "127.0.0.1", "testserver"))
CORS_ALLOWED_ORIGINS = env_list("DJANGO_CORS_ALLOWED_ORIGINS", ("http://localhost:3000", "http://127.0.0.1:3000"))
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", ())
if DEPLOYMENT_ENV == "production":
    if not os.environ.get("DJANGO_ALLOWED_HOSTS", "").strip() or not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must list explicit production hostnames")
    for variable, origins in (("DJANGO_CORS_ALLOWED_ORIGINS", CORS_ALLOWED_ORIGINS), ("DJANGO_CSRF_TRUSTED_ORIGINS", CSRF_TRUSTED_ORIGINS)):
        if not os.environ.get(variable, "").strip() or not origins:
            raise ImproperlyConfigured(f"{variable} must list explicit HTTPS origins in production")
        for origin in origins:
            parsed = urlsplit(origin)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
                raise ImproperlyConfigured(f"{variable} entries must be HTTPS origins without a path, query, or fragment")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "accounts.apps.AccountsConfig",
    "projects.apps.ProjectsConfig",
    "documents.apps.DocumentsConfig",
    "requirements.apps.RequirementsConfig",
    "business_intelligence.apps.BusinessIntelligenceConfig",
    "audience_intelligence.apps.AudienceIntelligenceConfig",
    "ai_orchestration.apps.AIOrchestrationConfig",
    "application_generation.apps.ApplicationGenerationConfig",
    "design.apps.DesignConfig",
    "testing.apps.TestingConfig",
    "traceability.apps.TraceabilityConfig",
    "approvals.apps.ApprovalsConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "config.middleware.ApiErrorMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
AUTH_USER_MODEL = "auth.User"

DATABASES = {"default": database_config(os.environ.get("SPECFORGE_DATABASE_URL"), debug=DEBUG)}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.environ.get("DJANGO_TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = Path(os.environ.get("DJANGO_MEDIA_ROOT", BASE_DIR / "media"))
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = True
if DEPLOYMENT_ENV == "production":
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31_536_000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["accounts.authentication.SessionTokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}
SPECTACULAR_SETTINGS = {
    "TITLE": "SpecForge AI API",
    "DESCRIPTION": "Hosted project engineering API. Feature endpoints are introduced phase by phase.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
