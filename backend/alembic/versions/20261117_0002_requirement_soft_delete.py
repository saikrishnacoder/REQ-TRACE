"""Add soft-delete timestamp for requirements.

Revision ID: 20261117_0002
Revises: 20261117_0001
Create Date: 2026-11-17
"""

from alembic import context, op
from sqlalchemy import Column, inspect
from sqlalchemy.dialects.oracle import TIMESTAMP

revision = "20261117_0002"
down_revision = "20261117_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The bootstrap revision is intentionally metadata-based and may already
    # include this column on a fresh install. Existing installations need it
    # added here. Keep both upgrade paths safe and data-preserving.
    # The bootstrap revision renders the complete current metadata for a new
    # offline install, so the column is already present in that generated SQL.
    # Offline SQL cannot inspect a live schema; online upgrades still inspect
    # legacy databases and add the column only when it is missing.
    if context.is_offline_mode():
        return
    columns = {column["name"].casefold() for column in inspect(op.get_bind()).get_columns("RT_REQUIREMENTS")}
    if "deleted_at" not in columns:
        op.add_column("RT_REQUIREMENTS", Column("DELETED_AT", TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    if context.is_offline_mode():
        op.drop_column("RT_REQUIREMENTS", "DELETED_AT")
        return
    columns = {column["name"].casefold() for column in inspect(op.get_bind()).get_columns("RT_REQUIREMENTS")}
    if "deleted_at" in columns:
        op.drop_column("RT_REQUIREMENTS", "DELETED_AT")
