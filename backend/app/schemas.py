from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

RequirementType = Literal["Functional", "Non-functional", "Security", "Performance", "Usability"]
Priority = Literal["Critical", "High", "Medium", "Low"]
SourceType = Literal["Conversation", "Document", "Manual"]
RequirementStatus = Literal["Draft", "Under review", "Approved", "Rejected"]


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
