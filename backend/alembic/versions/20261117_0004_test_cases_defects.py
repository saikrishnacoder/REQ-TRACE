"""Add persisted test cases and defects."""

from alembic import op

from app.models import Defect, TestCase

revision = "20261117_0004"
down_revision = "20261117_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    TestCase.__table__.create(bind=op.get_bind(), checkfirst=True)
    Defect.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # Domain history is retained across code rollback.
    pass
