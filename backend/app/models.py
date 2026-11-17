import json
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.oracle import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from app.database import Base


class JSONText(TypeDecorator):
    """Serialize small structured values into Oracle CLOB columns."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str:
        return json.dumps(value if value is not None else [], ensure_ascii=False)

    def process_result_value(self, value: str | None, dialect: Any) -> list[str]:
        if not value:
            return []
        return json.loads(value)


class Project(Base):
    __tablename__ = "RT_PROJECTS"
    __table_args__ = (UniqueConstraint("PROJECT_KEY", name="UQ_RT_PROJECTS_KEY"),)

    id: Mapped[str] = mapped_column("PROJECT_ID", String(36), primary_key=True)
    name: Mapped[str] = mapped_column("NAME", String(200), nullable=False)
    key: Mapped[str] = mapped_column("PROJECT_KEY", String(12), nullable=False)
    description: Mapped[str | None] = mapped_column("DESCRIPTION", String(1000), nullable=True, default="")
    next_requirement_number: Mapped[int] = mapped_column("NEXT_REQUIREMENT_NUMBER", Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class Requirement(Base):
    __tablename__ = "RT_REQUIREMENTS"
    __table_args__ = (
        UniqueConstraint("PROJECT_ID", "REQUIREMENT_CODE", name="UQ_RT_REQ_PROJECT_CODE"),
        CheckConstraint("REQUIREMENT_TYPE IN ('Functional','Non-functional','Security','Performance','Usability')", name="CK_RT_REQ_TYPE"),
        CheckConstraint("PRIORITY IN ('Critical','High','Medium','Low')", name="CK_RT_REQ_PRIORITY"),
        CheckConstraint("SOURCE_TYPE IN ('Conversation','Document','Manual')", name="CK_RT_REQ_SOURCE"),
        CheckConstraint("STATUS IN ('Draft','Under review','Approved','Rejected')", name="CK_RT_REQ_STATUS"),
        Index("IX_RT_REQ_PROJECT_STATUS", "PROJECT_ID", "STATUS"),
    )

    id: Mapped[str] = mapped_column("REQUIREMENT_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column("REQUIREMENT_CODE", String(40), nullable=False)
    title: Mapped[str] = mapped_column("TITLE", String(300), nullable=False)
    statement: Mapped[str] = mapped_column("STATEMENT", Text, nullable=False)
    requirement_type: Mapped[str] = mapped_column("REQUIREMENT_TYPE", String(32), nullable=False)
    priority: Mapped[str] = mapped_column("PRIORITY", String(16), nullable=False)
    actor: Mapped[str | None] = mapped_column("ACTOR", String(500), nullable=True, default="")
    preconditions: Mapped[str | None] = mapped_column("PRECONDITIONS", Text, nullable=True, default="")
    acceptance_criteria: Mapped[list[str]] = mapped_column("ACCEPTANCE_CRITERIA", JSONText(), nullable=False)
    source_type: Mapped[str] = mapped_column("SOURCE_TYPE", String(20), nullable=False)
    source_reference: Mapped[str] = mapped_column("SOURCE_REFERENCE", String(1000), nullable=False)
    original_text: Mapped[str] = mapped_column("ORIGINAL_TEXT", Text, nullable=False)
    status: Mapped[str] = mapped_column("STATUS", String(20), nullable=False, default="Draft")
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column("UPDATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())
    reviewed_at: Mapped[datetime | None] = mapped_column("REVIEWED_AT", TIMESTAMP(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column("DELETED_AT", TIMESTAMP(timezone=True), nullable=True)


class AuditEvent(Base):
    __tablename__ = "RT_AUDIT_EVENTS"
    __table_args__ = (Index("IX_RT_AUDIT_PROJECT_TIME", "PROJECT_ID", "CREATED_AT"),)

    id: Mapped[str] = mapped_column("EVENT_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    requirement_id: Mapped[str | None] = mapped_column("REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column("ACTION", String(40), nullable=False)
    detail: Mapped[str] = mapped_column("DETAIL", Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class SyncOutboxEvent(Base):
    """Durable change envelope committed with each local domain mutation."""

    __tablename__ = "RT_SYNC_OUTBOX"
    __table_args__ = (Index("IX_RT_SYNC_PENDING", "SYNCED_AT", "CREATED_AT"),)

    id: Mapped[str] = mapped_column("EVENT_ID", String(36), primary_key=True)
    event_type: Mapped[str] = mapped_column("EVENT_TYPE", String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column("ENTITY_TYPE", String(32), nullable=False)
    entity_id: Mapped[str] = mapped_column("ENTITY_ID", String(36), nullable=False)
    payload: Mapped[str] = mapped_column("PAYLOAD", Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())
    synced_at: Mapped[datetime | None] = mapped_column("SYNCED_AT", TIMESTAMP(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column("ATTEMPTS", Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column("LAST_ERROR", Text, nullable=True)


class RequirementLink(Base):
    __tablename__ = "RT_REQUIREMENT_LINKS"
    __table_args__ = (
        UniqueConstraint("SOURCE_REQUIREMENT_ID", "TARGET_REQUIREMENT_ID", "RELATIONSHIP_TYPE", name="UQ_RT_REQ_LINK_PAIR"),
        CheckConstraint("SOURCE_REQUIREMENT_ID <> TARGET_REQUIREMENT_ID", name="CK_RT_REQ_LINK_NOT_SELF"),
        CheckConstraint("RELATIONSHIP_TYPE IN ('depends_on','relates_to','conflicts_with')", name="CK_RT_REQ_LINK_TYPE"),
        Index("IX_RT_REQ_LINK_PROJECT", "PROJECT_ID", "SOURCE_REQUIREMENT_ID"),
    )

    id: Mapped[str] = mapped_column("LINK_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    source_requirement_id: Mapped[str] = mapped_column("SOURCE_REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="CASCADE"), nullable=False)
    target_requirement_id: Mapped[str] = mapped_column("TARGET_REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="CASCADE"), nullable=False)
    relationship_type: Mapped[str] = mapped_column("RELATIONSHIP_TYPE", String(24), nullable=False, default="depends_on")
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class TestCase(Base):
    __tablename__ = "RT_TEST_CASES"
    __table_args__ = (UniqueConstraint("PROJECT_ID", "CASE_CODE", name="UQ_RT_TEST_PROJECT_CODE"),)

    id: Mapped[str] = mapped_column("TEST_CASE_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    requirement_id: Mapped[str | None] = mapped_column("REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="SET NULL"), nullable=True)
    code: Mapped[str] = mapped_column("CASE_CODE", String(40), nullable=False)
    title: Mapped[str] = mapped_column("TITLE", String(300), nullable=False)
    preconditions: Mapped[str] = mapped_column("PRECONDITIONS", Text, nullable=False, default="")
    steps: Mapped[list[str]] = mapped_column("STEPS", JSONText(), nullable=False)
    expected_result: Mapped[str] = mapped_column("EXPECTED_RESULT", Text, nullable=False)
    status: Mapped[str] = mapped_column("STATUS", String(20), nullable=False, default="Ready")
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class Defect(Base):
    __tablename__ = "RT_DEFECTS"
    __table_args__ = (UniqueConstraint("PROJECT_ID", "DEFECT_CODE", name="UQ_RT_DEFECT_PROJECT_CODE"),)

    id: Mapped[str] = mapped_column("DEFECT_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    requirement_id: Mapped[str | None] = mapped_column("REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="SET NULL"), nullable=True)
    test_case_id: Mapped[str | None] = mapped_column("TEST_CASE_ID", String(36), ForeignKey("RT_TEST_CASES.TEST_CASE_ID", ondelete="SET NULL"), nullable=True)
    code: Mapped[str] = mapped_column("DEFECT_CODE", String(40), nullable=False)
    title: Mapped[str] = mapped_column("TITLE", String(300), nullable=False)
    description: Mapped[str] = mapped_column("DESCRIPTION", Text, nullable=False)
    severity: Mapped[str] = mapped_column("SEVERITY", String(20), nullable=False, default="Medium")
    status: Mapped[str] = mapped_column("STATUS", String(20), nullable=False, default="Open")
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class RequirementAnalysis(Base):
    __tablename__ = "RT_REQUIREMENT_ANALYSES"
    __table_args__ = (Index("IX_RT_ANALYSIS_REQUIREMENT", "REQUIREMENT_ID", "CREATED_AT"),)

    id: Mapped[str] = mapped_column("ANALYSIS_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    requirement_id: Mapped[str] = mapped_column("REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="CASCADE"), nullable=False)
    result_json: Mapped[str] = mapped_column("RESULT_JSON", Text, nullable=False)
    provider: Mapped[str] = mapped_column("PROVIDER", String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class TestExecution(Base):
    __tablename__ = "RT_TEST_EXECUTIONS"
    __table_args__ = (Index("IX_RT_EXEC_CASE_TIME", "TEST_CASE_ID", "EXECUTED_AT"),)

    id: Mapped[str] = mapped_column("EXECUTION_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    test_case_id: Mapped[str] = mapped_column("TEST_CASE_ID", String(36), ForeignKey("RT_TEST_CASES.TEST_CASE_ID", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column("STATUS", String(20), nullable=False)
    actual_result: Mapped[str] = mapped_column("ACTUAL_RESULT", Text, nullable=False)
    executed_at: Mapped[datetime] = mapped_column("EXECUTED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class Conversation(Base):
    __tablename__ = "RT_CONVERSATIONS"

    id: Mapped[str] = mapped_column("CONVERSATION_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column("TITLE", String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column("UPDATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class ConversationMessage(Base):
    __tablename__ = "RT_CONVERSATION_MESSAGES"
    __table_args__ = (Index("IX_RT_CHAT_CONV_TIME", "CONVERSATION_ID", "CREATED_AT"),)

    id: Mapped[str] = mapped_column("MESSAGE_ID", String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column("CONVERSATION_ID", String(36), ForeignKey("RT_CONVERSATIONS.CONVERSATION_ID", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column("ROLE", String(12), nullable=False)
    content: Mapped[str] = mapped_column("CONTENT", Text, nullable=False)
    sources_json: Mapped[str] = mapped_column("SOURCES_JSON", Text, nullable=False, default="[]")
    provider: Mapped[str] = mapped_column("PROVIDER", String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class GitHubRepository(Base):
    __tablename__ = "RT_GITHUB_REPOSITORIES"
    __table_args__ = (UniqueConstraint("PROJECT_ID", "FULL_NAME", name="UQ_RT_GH_REPO_PROJECT"),)

    id: Mapped[str] = mapped_column("REPOSITORY_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    full_name: Mapped[str] = mapped_column("FULL_NAME", String(300), nullable=False)
    html_url: Mapped[str] = mapped_column("HTML_URL", String(1000), nullable=False)
    default_branch: Mapped[str] = mapped_column("DEFAULT_BRANCH", String(255), nullable=False, default="main")
    synced_at: Mapped[datetime | None] = mapped_column("SYNCED_AT", TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class GitHubRecord(Base):
    __tablename__ = "RT_GITHUB_RECORDS"
    __table_args__ = (UniqueConstraint("REPOSITORY_ID", "RECORD_TYPE", "EXTERNAL_ID", name="UQ_RT_GH_RECORD_EXT"),
        Index("IX_RT_GH_RECORD_PROJECT", "PROJECT_ID", "REPOSITORY_ID", "RECORD_TYPE"))

    id: Mapped[str] = mapped_column("RECORD_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    repository_id: Mapped[str] = mapped_column("REPOSITORY_ID", String(36), ForeignKey("RT_GITHUB_REPOSITORIES.REPOSITORY_ID", ondelete="CASCADE"), nullable=False)
    record_type: Mapped[str] = mapped_column("RECORD_TYPE", String(20), nullable=False)
    external_id: Mapped[str] = mapped_column("EXTERNAL_ID", String(100), nullable=False)
    title: Mapped[str] = mapped_column("TITLE", String(500), nullable=False)
    state: Mapped[str] = mapped_column("STATE", String(32), nullable=False, default="")
    html_url: Mapped[str] = mapped_column("HTML_URL", String(1000), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column("UPDATED_AT", TIMESTAMP(timezone=True), nullable=True)


class GitHubLink(Base):
    __tablename__ = "RT_GITHUB_LINKS"
    __table_args__ = (UniqueConstraint("REQUIREMENT_ID", "RECORD_ID", name="UQ_RT_GH_LINK_PAIR"),)

    id: Mapped[str] = mapped_column("LINK_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    requirement_id: Mapped[str] = mapped_column("REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="CASCADE"), nullable=False)
    record_id: Mapped[str] = mapped_column("RECORD_ID", String(36), ForeignKey("RT_GITHUB_RECORDS.RECORD_ID", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class AutomationRule(Base):
    __tablename__ = "RT_AUTOMATION_RULES"
    __table_args__ = (UniqueConstraint("PROJECT_ID", "RULE_KEY", name="UQ_RT_AUTO_PROJECT_RULE"),)

    id: Mapped[str] = mapped_column("RULE_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    rule_key: Mapped[str] = mapped_column("RULE_KEY", String(60), nullable=False)
    enabled: Mapped[bool] = mapped_column("ENABLED", Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column("UPDATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class AutomationRun(Base):
    __tablename__ = "RT_AUTOMATION_RUNS"
    __table_args__ = (Index("IX_RT_AUTO_RUN_PROJECT", "PROJECT_ID", "EXECUTED_AT"),)

    id: Mapped[str] = mapped_column("RUN_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    rule_key: Mapped[str] = mapped_column("RULE_KEY", String(60), nullable=False)
    status: Mapped[str] = mapped_column("STATUS", String(12), nullable=False)
    result_json: Mapped[str] = mapped_column("RESULT_JSON", Text, nullable=False)
    detail: Mapped[str] = mapped_column("DETAIL", Text, nullable=False, default="")
    executed_at: Mapped[datetime] = mapped_column("EXECUTED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class RequirementVersion(Base):
    __tablename__ = "RT_REQUIREMENT_VERSIONS"
    __table_args__ = (UniqueConstraint("REQUIREMENT_ID", "VERSION_NUMBER", name="UQ_RT_REQ_VERSION_NUM"),
        Index("IX_RT_REQ_VERSION_TIME", "REQUIREMENT_ID", "CREATED_AT"))

    id: Mapped[str] = mapped_column("VERSION_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    requirement_id: Mapped[str] = mapped_column("REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column("VERSION_NUMBER", Integer, nullable=False)
    snapshot_json: Mapped[str] = mapped_column("SNAPSHOT_JSON", Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())


class RequirementComment(Base):
    __tablename__ = "RT_REQUIREMENT_COMMENTS"
    __table_args__ = (Index("IX_RT_REQ_COMMENT_TIME", "REQUIREMENT_ID", "CREATED_AT"),)

    id: Mapped[str] = mapped_column("COMMENT_ID", String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column("PROJECT_ID", String(36), ForeignKey("RT_PROJECTS.PROJECT_ID", ondelete="CASCADE"), nullable=False)
    requirement_id: Mapped[str] = mapped_column("REQUIREMENT_ID", String(36), ForeignKey("RT_REQUIREMENTS.REQUIREMENT_ID", ondelete="CASCADE"), nullable=False)
    author: Mapped[str] = mapped_column("AUTHOR", String(120), nullable=False)
    content: Mapped[str] = mapped_column("CONTENT", Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column("CREATED_AT", TIMESTAMP(timezone=True), nullable=False, server_default=func.current_timestamp())
