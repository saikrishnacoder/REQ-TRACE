"""Add configurable read-only automation checks and run history."""

from alembic import op

from app.models import AutomationRule, AutomationRun

revision = "20261117_0009"
down_revision = "20261117_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    AutomationRule.__table__.create(bind=op.get_bind(), checkfirst=True)
    AutomationRun.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    pass
