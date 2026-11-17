"""Add persisted requirement-to-requirement trace links.

Revision ID: 20261117_0003
Revises: 20261117_0002
Create Date: 2026-11-17
"""

from alembic import op

from app.models import RequirementLink

revision = "20261117_0003"
down_revision = "20261117_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    RequirementLink.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # Keep links when rolling application code back; removing trace data is not
    # a safe default downgrade for a user's workspace.
    pass
