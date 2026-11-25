"""Add workspace boundaries, project lifecycle data, and requirement fields.

Revision ID: 20261124_0014
Revises: 20261124_0013
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20261124_0014"
down_revision = "20261124_0013"
branch_labels = None
depends_on = None


def _names(table: str) -> set[str]:
    return {item["name"].casefold() for item in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # The current baseline migration emits the full ORM core in offline mode;
    # schema inspection is available only for online upgrades.
    from alembic import context
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    tables = {name.casefold() for name in inspect(bind).get_table_names()}
    if "rt_workspaces" not in tables:
        op.create_table(
            "RT_WORKSPACES",
            sa.Column("WORKSPACE_ID", sa.String(36), primary_key=True),
            sa.Column("NAME", sa.String(200), nullable=False),
            sa.Column("WORKSPACE_KEY", sa.String(24), nullable=False),
            sa.Column("OWNER_USER_ID", sa.String(36), sa.ForeignKey("RT_USERS.USER_ID", ondelete="SET NULL"), nullable=True),
            sa.Column("CREATED_AT", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
            sa.Column("UPDATED_AT", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
            sa.UniqueConstraint("WORKSPACE_KEY", name="UQ_RT_WORKSPACE_KEY"),
        )
    tables = {name.casefold() for name in inspect(bind).get_table_names()}
    if "rt_workspace_members" not in tables:
        op.create_table(
            "RT_WORKSPACE_MEMBERS",
            sa.Column("MEMBERSHIP_ID", sa.String(36), primary_key=True),
            sa.Column("WORKSPACE_ID", sa.String(36), sa.ForeignKey("RT_WORKSPACES.WORKSPACE_ID", ondelete="CASCADE"), nullable=False),
            sa.Column("USER_ID", sa.String(36), sa.ForeignKey("RT_USERS.USER_ID", ondelete="CASCADE"), nullable=False),
            sa.Column("WORKSPACE_ROLE", sa.String(16), nullable=False, server_default="Viewer"),
            sa.Column("CREATED_AT", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
            sa.UniqueConstraint("WORKSPACE_ID", "USER_ID", name="UQ_RT_WORKSPACE_MEMBER"),
            sa.CheckConstraint("WORKSPACE_ROLE IN ('Owner','Admin','Editor','Viewer')", name="CK_RT_WORKSPACE_MEMBER_ROLE"),
        )
        op.create_index("IX_RT_WORKSPACE_MEMBER_USER", "RT_WORKSPACE_MEMBERS", ["USER_ID", "WORKSPACE_ID"])

    # Preserve every existing project in a shared migration workspace; legacy
    # project memberships continue to provide project-specific access.
    op.execute(sa.text(
        "INSERT INTO RT_WORKSPACES (WORKSPACE_ID, NAME, WORKSPACE_KEY) "
        "SELECT 'default-workspace', 'Default Workspace', 'DEFAULT' "
        "WHERE NOT EXISTS (SELECT 1 FROM RT_WORKSPACES WHERE WORKSPACE_ID='default-workspace')"
    ))
    project_columns = _names("RT_PROJECTS")
    if "workspace_id" not in project_columns:
        with op.batch_alter_table("RT_PROJECTS") as batch:
            batch.add_column(sa.Column("WORKSPACE_ID", sa.String(36), nullable=True))
            batch.add_column(sa.Column("OWNER_USER_ID", sa.String(36), nullable=True))
            batch.add_column(sa.Column("CATEGORY", sa.String(80), nullable=False, server_default="General"))
            batch.add_column(sa.Column("STATUS", sa.String(20), nullable=False, server_default="Active"))
            batch.add_column(sa.Column("PRIORITY", sa.String(16), nullable=False, server_default="Medium"))
            batch.add_column(sa.Column("START_DATE", sa.TIMESTAMP(timezone=True), nullable=True))
            batch.add_column(sa.Column("TARGET_DATE", sa.TIMESTAMP(timezone=True), nullable=True))
            batch.add_column(sa.Column("OBJECTIVES", sa.Text(), nullable=True))
            batch.add_column(sa.Column("ARCHIVED_AT", sa.TIMESTAMP(timezone=True), nullable=True))
            batch.add_column(sa.Column("DELETED_AT", sa.TIMESTAMP(timezone=True), nullable=True))
            batch.add_column(sa.Column("UPDATED_AT", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.current_timestamp()))
            batch.create_foreign_key("FK_RT_PROJECT_WORKSPACE", "RT_WORKSPACES", ["WORKSPACE_ID"], ["WORKSPACE_ID"], ondelete="RESTRICT")
            batch.create_foreign_key("FK_RT_PROJECT_OWNER", "RT_USERS", ["OWNER_USER_ID"], ["USER_ID"], ondelete="SET NULL")
    op.execute(sa.text("UPDATE RT_PROJECTS SET WORKSPACE_ID='default-workspace' WHERE WORKSPACE_ID IS NULL"))
    with op.batch_alter_table("RT_PROJECTS") as batch:
        batch.alter_column("WORKSPACE_ID", existing_type=sa.String(36), nullable=False)
    project_checks = {item.get("name") for item in inspect(bind).get_check_constraints("RT_PROJECTS") if item.get("name")}
    project_columns = _names("RT_PROJECTS")
    with op.batch_alter_table("RT_PROJECTS") as batch:
        if "STATUS" in project_columns and "CK_RT_PROJECT_STATUS" not in project_checks:
            batch.create_check_constraint("CK_RT_PROJECT_STATUS", "STATUS IN ('Active','On hold','Completed','Archived')")
        if "PRIORITY" in project_columns and "CK_RT_PROJECT_PRIORITY" not in project_checks:
            batch.create_check_constraint("CK_RT_PROJECT_PRIORITY", "PRIORITY IN ('Critical','High','Medium','Low')")

    requirement_columns = _names("RT_REQUIREMENTS")
    checks = {item["name"] for item in inspect(bind).get_check_constraints("RT_REQUIREMENTS") if item.get("name")}
    with op.batch_alter_table("RT_REQUIREMENTS") as batch:
        if "description" not in requirement_columns:
            batch.add_column(sa.Column("DESCRIPTION", sa.Text(), nullable=True))
        if "owner_user_id" not in requirement_columns:
            batch.add_column(sa.Column("OWNER_USER_ID", sa.String(36), nullable=True))
            batch.create_foreign_key("FK_RT_REQUIREMENT_OWNER", "RT_USERS", ["OWNER_USER_ID"], ["USER_ID"], ondelete="SET NULL")
        if "verification_method" not in requirement_columns:
            batch.add_column(sa.Column("VERIFICATION_METHOD", sa.String(32), nullable=False, server_default="Test"))
        if "current_version" not in requirement_columns:
            batch.add_column(sa.Column("CURRENT_VERSION", sa.Integer(), nullable=False, server_default="1"))
        if "tags" not in requirement_columns:
            batch.add_column(sa.Column("TAGS", sa.Text(), nullable=True))
        if "CK_RT_REQ_TYPE" in checks:
            batch.drop_constraint("CK_RT_REQ_TYPE", type_="check")
        if "requirement_type" in requirement_columns:
            batch.create_check_constraint(
                "CK_RT_REQ_TYPE",
                "REQUIREMENT_TYPE IN ('Functional','Non-functional','Performance','Security','Usability','Technical','Interface','Business','Regulatory','Constraint')",
            )
        if "CK_RT_REQ_STATUS" in checks:
            batch.drop_constraint("CK_RT_REQ_STATUS", type_="check")
        if "status" in requirement_columns:
            batch.create_check_constraint(
                "CK_RT_REQ_STATUS",
                "STATUS IN ('Draft','Under review','Approved','In progress','Implemented','Verified','Rejected','Archived')",
            )

    op.execute(sa.text(
        "UPDATE RT_REQUIREMENTS SET CURRENT_VERSION = COALESCE(("
        "SELECT MAX(VERSION_NUMBER) FROM RT_REQUIREMENT_VERSIONS "
        "WHERE RT_REQUIREMENT_VERSIONS.REQUIREMENT_ID=RT_REQUIREMENTS.REQUIREMENT_ID), 1)"
    ))
    op.execute(sa.text("UPDATE RT_REQUIREMENTS SET TAGS='[]' WHERE TAGS IS NULL"))
    with op.batch_alter_table("RT_REQUIREMENTS") as batch:
        batch.alter_column("TAGS", existing_type=sa.Text(), nullable=False)

    version_uniques = {item.get("name") for item in inspect(bind).get_unique_constraints("RT_REQUIREMENT_VERSIONS")}
    if "UQ_RT_REQ_VERSION_NUM" not in version_uniques:
        with op.batch_alter_table("RT_REQUIREMENT_VERSIONS") as batch:
            batch.create_unique_constraint("UQ_RT_REQ_VERSION_NUM", ["REQUIREMENT_ID", "VERSION_NUMBER"])


def downgrade() -> None:
    # This application deliberately supports forward-only production upgrades.
    raise RuntimeError("Revision 20261124_0014 is forward-only; restore from backup to reverse it")
