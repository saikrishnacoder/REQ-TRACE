"""Upgrade the configured ReqTrace database to the latest schema."""

from pathlib import Path

from alembic import command
from alembic.config import Config


def main() -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    print("ReqTrace database schema is up to date.")


if __name__ == "__main__":
    main()
