"""Add user accounts for authenticated API mode."""

from alembic import op

from app.models import UserAccount

revision = "20261118_0011"
down_revision = "20261117_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    UserAccount.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    UserAccount.__table__.drop(bind=op.get_bind(), checkfirst=True)
