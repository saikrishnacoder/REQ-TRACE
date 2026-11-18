from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

RequirementType = Literal["Functional", "Non-functional", "Security", "Performance", "Usability"]
Priority = Literal["Critical", "High", "Medium", "Low"]
SourceType = Literal["Conversation", "Document", "Manual"]
RequirementStatus = Literal["Draft", "Under review", "Approved", "Rejected"]
RelationshipType = Literal["depends_on", "relates_to", "conflicts_with"]


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=lambda value: value.split("_")[0] + "".join(part.title() for part in value.split("_")[1:]))


class LoginRequest(APIModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(APIModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict[str, str]


class UserAccountCreate(APIModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=12, max_length=256)
    role: Literal["Admin", "Editor", "Viewer"] = "Viewer"

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().casefold()
        if normalized.count("@") != 1 or "." not in normalized.rsplit("@", 1)[-1]:
            raise ValueError("Enter a valid email address")
        return normalized


class UserAccountUpdate(APIModel):
    role: Literal["Admin", "Editor", "Viewer"] | None = None
    active: bool | None = None

    @model_validator(mode="after")
    def reject_null_updates(self):
        if any(name in self.model_fields_set and getattr(self, name) is None for name in ("role", "active")):
            raise ValueError("Role and active must have concrete values")
        return self


class UserAccountRead(APIModel):
    id: str
    email: str
    role: str
    active: bool
    created_at: datetime


class ProjectMemberCreate(APIModel):
    user_id: str = Field(min_length=1, max_length=36)
    role: Literal["Editor", "Viewer"] = "Viewer"


class ProjectMemberRead(APIModel):
    id: str
    project_id: str
    user_id: str
    role: str
    created_at: datetime


class ProjectCreate(APIModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=200)
    key: str = Field(min_length=1, max_length=12, pattern=r"^[A-Z0-9-]+$")
    description: str = Field(default="", max_length=1000)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Project name cannot be blank")
        return value

    @field_validator("key", mode="before")
    @classmethod
    def normalize_key(cls, value):
        return str(value).strip().upper()


class ProjectRead(APIModel):
    id: str
    name: str
    key: str
    description: str
    created_at: datetime

    @field_validator("description", mode="before")
    @classmethod
    def normalize_optional_description(cls, value):
        return value or ""


class RequirementCreate(APIModel):
    id: str | None = None
    code: str | None = Field(default=None, max_length=40)
    title: str = Field(min_length=1, max_length=300)
    statement: str = Field(min_length=1)
    requirement_type: RequirementType = Field(validation_alias=AliasChoices("type", "requirement_type"), serialization_alias="type")
    priority: Priority
    actor: str = Field(default="", max_length=500)
    preconditions: str = ""
    acceptance_criteria: list[str] = Field(default_factory=list)
    source_type: SourceType
    source_reference: str = Field(max_length=1000)
    original_text: str

    @field_validator("title", "statement", "source_reference", "original_text", mode="before")
    @classmethod
    def validate_required_text(cls, value):
        value = str(value).strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class RequirementUpdate(APIModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    statement: str | None = Field(default=None, min_length=1)
    requirement_type: RequirementType | None = Field(default=None, validation_alias=AliasChoices("type", "requirement_type"), serialization_alias="type")
    priority: Priority | None = None
    actor: str | None = None
    preconditions: str | None = None
    acceptance_criteria: list[str] | None = None
    status: RequirementStatus | None = None

    @field_validator("title", "statement", mode="before")
    @classmethod
    def validate_nonblank_updates(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class RequirementRead(APIModel):
    id: str
    project_id: str
    code: str
    title: str
    statement: str
    requirement_type: RequirementType = Field(serialization_alias="type")
    priority: Priority
    actor: str
    preconditions: str
    acceptance_criteria: list[str]
    source_type: SourceType
    source_reference: str
    original_text: str
    status: RequirementStatus
    created_at: datetime
    updated_at: datetime
    reviewed_at: datetime | None

    @field_validator("actor", "preconditions", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        return value or ""


class AuditEventRead(APIModel):
    id: str
    project_id: str
    requirement_id: str | None
    action: str
    detail: str
    created_at: datetime


class RequirementLinkCreate(APIModel):
    target_requirement_id: str = Field(min_length=1, max_length=36)
    relationship_type: RelationshipType = "depends_on"


class RequirementLinkRead(APIModel):
    id: str
    project_id: str
    source_requirement_id: str
    target_requirement_id: str
    relationship_type: RelationshipType
    created_at: datetime


class TraceabilityRead(APIModel):
    requirements: list[RequirementRead]
    links: list[RequirementLinkRead]
    orphan_requirement_ids: list[str]
    linked_percent: int
    test_cases: list[dict[str, Any]]
    executions: list[dict[str, Any]]
    defects: list[dict[str, Any]]
    github_links: list[dict[str, Any]]
    untested_requirement_ids: list[str]
    failed_test_case_ids: list[str]
    test_covered_percent: int


class TestCaseCreate(APIModel):
    requirement_id: str | None = None
    title: str = Field(min_length=1, max_length=300)
    preconditions: str = ""
    steps: list[str] = Field(min_length=1)
    expected_result: str = Field(min_length=1)


class TestCaseRead(APIModel):
    id: str
    project_id: str
    requirement_id: str | None
    code: str
    title: str
    preconditions: str
    steps: list[str]
    expected_result: str
    status: str
    created_at: datetime


class DefectCreate(APIModel):
    requirement_id: str | None = None
    test_case_id: str | None = None
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=1)
    severity: Literal["Critical", "High", "Medium", "Low"] = "Medium"


class DefectUpdate(APIModel):
    status: Literal["Open", "In progress", "Resolved", "Closed"]


class DefectRead(APIModel):
    id: str
    project_id: str
    requirement_id: str | None
    test_case_id: str | None
    code: str
    title: str
    description: str
    severity: str
    status: str
    created_at: datetime


class TestExecutionCreate(APIModel):
    status: Literal["Passed", "Failed", "Blocked", "Skipped"]
    actual_result: str = Field(min_length=1, max_length=5000)


class TestExecutionRead(APIModel):
    id: str
    project_id: str
    test_case_id: str
    status: str
    actual_result: str
    executed_at: datetime


class ConversationCreate(APIModel):
    title: str = Field(default="New conversation", min_length=1, max_length=300)


class AssistantMessageCreate(APIModel):
    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=10000)


class ConversationRead(APIModel):
    id: str
    project_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationMessageRead(APIModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant"]
    content: str
    sources: list[dict[str, str]]
    provider: str
    created_at: datetime


class AssistantReply(APIModel):
    conversation: ConversationRead
    user_message: ConversationMessageRead
    assistant_message: ConversationMessageRead


class GitHubRepositorySelect(APIModel):
    full_name: str = Field(min_length=3, max_length=300, pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


class GitHubRepositoryRead(APIModel):
    id: str
    project_id: str
    full_name: str
    html_url: str
    default_branch: str
    synced_at: datetime | None


class GitHubRecordRead(APIModel):
    id: str
    project_id: str
    repository_id: str
    record_type: Literal["issue", "pull_request", "commit", "branch"]
    external_id: str
    title: str
    state: str
    html_url: str
    updated_at: datetime | None


class GitHubLinkCreate(APIModel):
    record_id: str = Field(min_length=1, max_length=36)


class GitHubLinkRead(APIModel):
    id: str
    project_id: str
    requirement_id: str
    record_id: str
    created_at: datetime
    record: GitHubRecordRead


class AutomationRuleUpdate(APIModel):
    enabled: bool


class AutomationRuleRead(APIModel):
    id: str
    project_id: str
    rule_key: Literal["orphan_requirements", "untested_requirements", "critical_defects"]
    enabled: bool
    updated_at: datetime


class AutomationRunRead(APIModel):
    id: str
    project_id: str
    rule_key: str
    status: Literal["success", "failed"]
    findings: list[str]
    detail: str
    executed_at: datetime


class RequirementVersionRead(APIModel):
    id: str
    project_id: str
    requirement_id: str
    version_number: int
    snapshot: dict[str, Any]
    created_at: datetime


class RequirementCommentCreate(APIModel):
    content: str = Field(min_length=1, max_length=5000)
    author: str = Field(default="Local user", min_length=1, max_length=120)


class RequirementCommentRead(APIModel):
    id: str
    project_id: str
    requirement_id: str
    author: str
    content: str
    created_at: datetime


class TestCaseSuggestion(APIModel):
    title: str = Field(min_length=1, max_length=300)
    scenario_type: Literal["positive", "negative", "boundary", "functional", "regression"]
    preconditions: str = Field(default="", max_length=3000)
    steps: list[str] = Field(min_length=1, max_length=30)
    expected_result: str = Field(min_length=1, max_length=3000)


class TestCaseSuggestionsRead(APIModel):
    requirement_id: str
    provider: str
    saved_automatically: bool = False
    suggestions: list[TestCaseSuggestion] = Field(max_length=12)


class AnalysisIssue(APIModel):
    category: Literal["clarity", "ambiguity", "completeness", "testability", "duplicate", "contradiction"]
    explanation: str = Field(min_length=1, max_length=1000)
    evidence: str = Field(default="", max_length=1000)


class RequirementAnalysisResult(APIModel):
    quality_score: int = Field(ge=0, le=100)
    clarity_score: int = Field(ge=0, le=100)
    completeness_score: int = Field(ge=0, le=100)
    testability_score: int = Field(ge=0, le=100)
    ambiguity_score: int = Field(ge=0, le=100)
    issues: list[AnalysisIssue] = Field(default_factory=list, max_length=20)
    suggested_improvements: list[str] = Field(default_factory=list, max_length=12)
    recommended_acceptance_criteria: list[str] = Field(default_factory=list, max_length=12)
    is_ai_generated: bool = True


class RequirementAnalysisRead(APIModel):
    id: str
    project_id: str
    requirement_id: str
    result: RequirementAnalysisResult
    provider: str
    created_at: datetime
