"""Bootstrap the existing Phase 1 schema without replacing existing tables.

Revision ID: 20261117_0001
Revises:
Create Date: 2026-11-17
"""

from alembic import context, op

from app import models  # noqa: F401 - register ORM models
from app.database import Base

revision = "20261117_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # `checkfirst` preserves all tables created by earlier create_all releases.
    # Future schema changes must be added as explicit revisions after this one.
    if context.is_offline_mode():
        # Offline SQL cannot inspect the target database. Emit only the core
        # Phase 1 tables here; later revisions create their own tables. The
        # metadata reflects the current schema, so the soft-delete column is
        # already included and revision 0002 skips its online-only inspection.
        core_tables = {"RT_PROJECTS", "RT_REQUIREMENTS", "RT_AUDIT_EVENTS", "RT_SYNC_OUTBOX"}
        for table in Base.metadata.sorted_tables:
            if table.name in core_tables:
                table.create(bind=op.get_bind(), checkfirst=False)
        return
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # The bootstrap revision owns no safe destructive downgrade. Keeping the
    # Phase 1 tables avoids deleting a user's local workspace by mistake.
    pass
