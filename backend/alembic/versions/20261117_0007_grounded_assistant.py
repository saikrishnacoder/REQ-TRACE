"""Add project-scoped assistant conversation history."""

from alembic import op

from app.models import Conversation, ConversationMessage

revision = "20261117_0007"
down_revision = "20261117_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Conversation.__table__.create(bind=op.get_bind(), checkfirst=True)
    ConversationMessage.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    pass
