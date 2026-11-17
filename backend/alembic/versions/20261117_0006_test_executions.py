"""Add persisted manual test execution history."""

from alembic import op

from app.models import TestExecution

revision = "20261117_0006"
down_revision = "20261117_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    TestExecution.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    pass
