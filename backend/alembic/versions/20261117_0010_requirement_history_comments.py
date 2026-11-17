"""Add requirement version snapshots and discussion comments."""

from alembic import op

from app.models import RequirementComment, RequirementVersion

revision = "20261117_0010"
down_revision = "20261117_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    RequirementVersion.__table__.create(bind=op.get_bind(), checkfirst=True)
    RequirementComment.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    pass
