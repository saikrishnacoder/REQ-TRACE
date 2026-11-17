"""Add persisted GitHub repository snapshots and requirement references."""

from alembic import op

from app.models import GitHubLink, GitHubRecord, GitHubRepository

revision = "20261117_0008"
down_revision = "20261117_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    GitHubRepository.__table__.create(bind=op.get_bind(), checkfirst=True)
    GitHubRecord.__table__.create(bind=op.get_bind(), checkfirst=True)
    GitHubLink.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    pass
