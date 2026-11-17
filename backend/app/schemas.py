from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

RequirementType = Literal["Functional", "Non-functional", "Security", "Performance", "Usability"]
Priority = Literal["Critical", "High", "Medium", "Low"]
SourceType = Literal["Conversation", "Document", "Manual"]
RequirementStatus = Literal["Draft", "Under review", "Approved", "Rejected"]
RelationshipType = Literal["depends_on", "relates_to", "conflicts_with"]


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, alias_generator=lambda value: value.split("_")[0] + "".join(part.title() for part in value.split("_")[1:]))


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
