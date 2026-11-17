"""Add soft-delete timestamp for requirements.

Revision ID: 20261117_0002
Revises: 20261117_0001
Create Date: 2026-11-17
"""

from alembic import op
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
    columns = {column["name"].casefold() for column in inspect(op.get_bind()).get_columns("RT_REQUIREMENTS")}
    if "deleted_at" not in columns:
        op.add_column("RT_REQUIREMENTS", Column("DELETED_AT", TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    columns = {column["name"].casefold() for column in inspect(op.get_bind()).get_columns("RT_REQUIREMENTS")}
    if "deleted_at" in columns:
        op.drop_column("RT_REQUIREMENTS", "DELETED_AT")
