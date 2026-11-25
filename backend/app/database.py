from sqlalchemy import URL, create_engine, make_url
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from fastapi import Request

from app.config import settings

database_url = settings.resolved_database_url
database_name = make_url(database_url) if isinstance(database_url, str) else database_url

if database_name.get_backend_name() == "oracle" and settings.oracle_client_lib_dir:
    import oracledb

    oracledb.init_oracle_client(
        lib_dir=settings.oracle_client_lib_dir,
        config_dir=settings.oracle_config_dir,
    )


class Base(DeclarativeBase):
    pass


engine_options = {"pool_pre_ping": True}
if settings.is_serverless:
    engine_options["poolclass"] = NullPool
elif database_name.get_backend_name() == "sqlite":
    engine_options["connect_args"] = {"check_same_thread": False}
else:
    engine_options["pool_recycle"] = 1800

engine = create_engine(database_name, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db(request: Request):
    session = SessionLocal()
    identity = getattr(request.state, "user", None)
    if identity:
        session.info["actor_user_id"] = identity.get("sub")
    try:
        yield session
    finally:
        session.close()
