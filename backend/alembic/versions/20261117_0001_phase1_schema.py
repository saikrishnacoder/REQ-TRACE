"""Bootstrap the existing Phase 1 schema without replacing existing tables.

Revision ID: 20261117_0001
Revises:
Create Date: 2026-11-17
"""

from alembic import op

from app import models  # noqa: F401 - register ORM models
from app.database import Base

revision = "20261117_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # `checkfirst` preserves all tables created by earlier create_all releases.
    # Future schema changes must be added as explicit revisions after this one.
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # The bootstrap revision owns no safe destructive downgrade. Keeping the
    # Phase 1 tables avoids deleting a user's local workspace by mistake.
    pass
