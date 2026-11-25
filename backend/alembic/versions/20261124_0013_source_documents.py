"""Persist extracted document sources and link them to requirements."""

from alembic import context, op
from sqlalchemy import Column, ForeignKey, String, inspect

from app.models import SourceDocument

revision = "20261124_0013"
down_revision = "20261118_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The Phase 1 bootstrap emits this core table in offline mode, where schema
    # inspection cannot determine whether DDL is needed.
    if context.is_offline_mode():
        return
    SourceDocument.__table__.create(bind=op.get_bind(), checkfirst=True)
    columns = {column["name"].casefold() for column in inspect(op.get_bind()).get_columns("RT_REQUIREMENTS")}
    if "source_document_id" not in columns:
        with op.batch_alter_table("RT_REQUIREMENTS") as batch:
            batch.add_column(Column(
                "SOURCE_DOCUMENT_ID",
                String(36),
                ForeignKey("RT_SOURCE_DOCUMENTS.DOCUMENT_ID", name="FK_RT_REQ_SOURCE_DOC", ondelete="SET NULL"),
                nullable=True,
            ))
    indexes = {index["name"].casefold() for index in inspect(op.get_bind()).get_indexes("RT_REQUIREMENTS")}
    if "ix_rt_req_source_document" not in indexes:
        op.create_index("IX_RT_REQ_SOURCE_DOCUMENT", "RT_REQUIREMENTS", ["SOURCE_DOCUMENT_ID"])


def downgrade() -> None:
    op.drop_index("IX_RT_REQ_SOURCE_DOCUMENT", table_name="RT_REQUIREMENTS")
    op.drop_column("RT_REQUIREMENTS", "SOURCE_DOCUMENT_ID")
    SourceDocument.__table__.drop(bind=op.get_bind(), checkfirst=True)
