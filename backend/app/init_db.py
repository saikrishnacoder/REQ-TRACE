"""Create the ReqTrace tables in the configured database."""

from app.database import Base, engine
from app import models  # noqa: F401 - register ORM models with Base


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"ReqTrace {engine.dialect.name} schema is ready.")


if __name__ == "__main__":
    main()
