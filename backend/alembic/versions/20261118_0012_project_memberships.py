"""Add project membership boundaries for authenticated users."""

from alembic import op

from app.models import ProjectMembership

revision = "20261118_0012"
down_revision = "20261118_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    ProjectMembership.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    ProjectMembership.__table__.drop(bind=op.get_bind(), checkfirst=True)
