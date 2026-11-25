"""Add revocable sessions and account security audit data.

Revision ID: 20261125_0015
Revises: 20261124_0014
"""

from alembic import op, context
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20261125_0015"
down_revision = "20261124_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        # Offline scripts represent a canonical upgrade from revision 0014,
        # where these base tables exist but the security columns do not.
        op.add_column("RT_USERS", sa.Column("TOKEN_VERSION", sa.Integer(), nullable=False, server_default="1"))
        op.add_column("RT_AUDIT_EVENTS", sa.Column("ACTOR_USER_ID", sa.String(36), nullable=True))
        op.create_foreign_key("FK_RT_AUDIT_ACTOR", "RT_AUDIT_EVENTS", "RT_USERS", ["ACTOR_USER_ID"], ["USER_ID"], ondelete="SET NULL")
        op.create_table(
            "RT_ACCOUNT_SECURITY_EVENTS",
            sa.Column("EVENT_ID", sa.String(36), primary_key=True),
            sa.Column("ACTOR_USER_ID", sa.String(36), sa.ForeignKey("RT_USERS.USER_ID", ondelete="SET NULL"), nullable=True),
            sa.Column("SUBJECT_USER_ID", sa.String(36), sa.ForeignKey("RT_USERS.USER_ID", ondelete="SET NULL"), nullable=True),
            sa.Column("WORKSPACE_ID", sa.String(36), sa.ForeignKey("RT_WORKSPACES.WORKSPACE_ID", ondelete="SET NULL"), nullable=True),
            sa.Column("ACTION", sa.String(80), nullable=False),
            sa.Column("DETAIL", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("CREATED_AT", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
        )
        op.create_table(
            "RT_PASSWORD_RESET_TOKENS",
            sa.Column("RESET_ID", sa.String(36), primary_key=True),
            sa.Column("USER_ID", sa.String(36), sa.ForeignKey("RT_USERS.USER_ID", ondelete="CASCADE"), nullable=False),
            sa.Column("TOKEN_DIGEST", sa.String(64), nullable=False),
            sa.Column("EXPIRES_AT", sa.TIMESTAMP(timezone=True), nullable=False),
            sa.Column("USED_AT", sa.TIMESTAMP(timezone=True), nullable=True),
            sa.Column("CREATED_AT", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
            sa.UniqueConstraint("TOKEN_DIGEST", name="UQ_RT_RESET_TOKEN_DIGEST"),
        )
        op.create_index("IX_RT_ACCOUNT_EVENT_CREATED", "RT_ACCOUNT_SECURITY_EVENTS", ["CREATED_AT"])
        op.create_index("IX_RT_RESET_USER_EXPIRES", "RT_PASSWORD_RESET_TOKENS", ["USER_ID", "EXPIRES_AT"])
        return
    bind = op.get_bind()
    inspector = inspect(bind)
    tables = {table.casefold() for table in inspector.get_table_names()}
    user_columns = {column["name"].casefold() for column in inspector.get_columns("RT_USERS")}
    if "token_version" not in user_columns:
        op.add_column("RT_USERS", sa.Column("TOKEN_VERSION", sa.Integer(), nullable=False, server_default="1"))
    audit_columns = {column["name"].casefold() for column in inspector.get_columns("RT_AUDIT_EVENTS")}
    if "actor_user_id" not in audit_columns:
        op.add_column("RT_AUDIT_EVENTS", sa.Column("ACTOR_USER_ID", sa.String(36), nullable=True))
    audit_fks = {tuple(fk.get("constrained_columns", [])) for fk in inspect(bind).get_foreign_keys("RT_AUDIT_EVENTS")}
    if ("ACTOR_USER_ID",) not in audit_fks and ("actor_user_id",) not in audit_fks:
        with op.batch_alter_table("RT_AUDIT_EVENTS") as batch:
            batch.create_foreign_key(
                "FK_RT_AUDIT_ACTOR", "RT_USERS", ["ACTOR_USER_ID"], ["USER_ID"], ondelete="SET NULL",
            )
    if "rt_account_security_events" not in tables:
        op.create_table(
            "RT_ACCOUNT_SECURITY_EVENTS",
            sa.Column("EVENT_ID", sa.String(36), primary_key=True),
            sa.Column("ACTOR_USER_ID", sa.String(36), sa.ForeignKey("RT_USERS.USER_ID", ondelete="SET NULL"), nullable=True),
            sa.Column("SUBJECT_USER_ID", sa.String(36), sa.ForeignKey("RT_USERS.USER_ID", ondelete="SET NULL"), nullable=True),
            sa.Column("WORKSPACE_ID", sa.String(36), sa.ForeignKey("RT_WORKSPACES.WORKSPACE_ID", ondelete="SET NULL"), nullable=True),
            sa.Column("ACTION", sa.String(80), nullable=False),
            sa.Column("DETAIL", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("CREATED_AT", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
        )
    if "rt_password_reset_tokens" not in tables:
        op.create_table(
            "RT_PASSWORD_RESET_TOKENS",
            sa.Column("RESET_ID", sa.String(36), primary_key=True),
            sa.Column("USER_ID", sa.String(36), sa.ForeignKey("RT_USERS.USER_ID", ondelete="CASCADE"), nullable=False),
            sa.Column("TOKEN_DIGEST", sa.String(64), nullable=False),
            sa.Column("EXPIRES_AT", sa.TIMESTAMP(timezone=True), nullable=False),
            sa.Column("USED_AT", sa.TIMESTAMP(timezone=True), nullable=True),
            sa.Column("CREATED_AT", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
            sa.UniqueConstraint("TOKEN_DIGEST", name="UQ_RT_RESET_TOKEN_DIGEST"),
        )
    for table, name, columns in (
        ("RT_ACCOUNT_SECURITY_EVENTS", "IX_RT_ACCOUNT_EVENT_CREATED", ["CREATED_AT"]),
        ("RT_PASSWORD_RESET_TOKENS", "IX_RT_RESET_USER_EXPIRES", ["USER_ID", "EXPIRES_AT"]),
    ):
        indexes = {index["name"].casefold() for index in inspect(bind).get_indexes(table) if index.get("name")}
        if name.casefold() not in indexes:
            op.create_index(name, table, columns)


def downgrade() -> None:
    raise RuntimeError("Revision 20261125_0015 is forward-only; restore from backup to reverse it")
