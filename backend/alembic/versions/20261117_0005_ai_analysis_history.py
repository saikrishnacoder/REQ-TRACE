"""Persist structured requirement analysis history."""

from alembic import op

from app.models import RequirementAnalysis

revision = "20261117_0005"
down_revision = "20261117_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    RequirementAnalysis.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    pass
