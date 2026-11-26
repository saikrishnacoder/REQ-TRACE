import uuid

from django.conf import settings
from django.db import models


class Requirement(models.Model):
    class Category(models.TextChoices):
        FUNCTIONAL = "Functional", "Functional"
        NON_FUNCTIONAL = "Non-functional", "Non-functional"
        BUSINESS = "Business", "Business"
        USER = "User", "User"
        TECHNICAL = "Technical", "Technical"
        COMPLIANCE = "Compliance", "Compliance"
        CONSTRAINT = "Constraint", "Constraint"
        DEPENDENCY = "Dependency", "Dependency"
        RISK = "Risk", "Risk"
        ASSUMPTION = "Assumption", "Assumption"
        OPEN_QUESTION = "Open question", "Open question"

    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        UNDER_REVIEW = "Under Review", "Under Review"
        APPROVED = "Approved", "Approved"
        IN_PROGRESS = "In Progress", "In Progress"
        IMPLEMENTED = "Implemented", "Implemented"
        VERIFIED = "Verified", "Verified"
        REJECTED = "Rejected", "Rejected"
        ARCHIVED = "Archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="requirements")
    source_document = models.ForeignKey("documents.SourceDocument", on_delete=models.SET_NULL, null=True, blank=True, related_name="requirements")
    code = models.CharField(max_length=64)
    title = models.CharField(max_length=240)
    description = models.TextField(blank=True)
    statement = models.TextField()
    category = models.CharField(max_length=32, choices=Category.choices)
    priority = models.CharField(max_length=16, default="Medium")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    approval_state = models.CharField(max_length=20, default="Pending")
    stakeholder = models.CharField(max_length=180, blank=True)
    acceptance_criteria = models.JSONField(default=list, blank=True)
    dependencies = models.JSONField(default=list, blank=True)
    source_page = models.PositiveIntegerField(null=True, blank=True)
    source_section = models.CharField(max_length=240, blank=True)
    current_version = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="authored_specforge_requirements")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]
        constraints = [models.UniqueConstraint(fields=["project", "code"], name="sf_requirement_project_code_unique")]
        indexes = [
            models.Index(fields=["project", "status"], name="sf_req_project_status_idx"),
            models.Index(fields=["project", "category"], name="sf_req_project_category_idx"),
            models.Index(fields=["project", "priority"], name="sf_req_project_priority_idx"),
            models.Index(fields=["project", "updated_at"], name="sf_req_project_updated_idx"),
        ]


class RequirementVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(Requirement, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField()
    snapshot = models.JSONField()
    change_reason = models.CharField(max_length=500, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="requirement_versions_created")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["requirement", "version"], name="sf_req_version_unique")]
        indexes = [models.Index(fields=["requirement", "created_at"], name="sf_req_version_time_idx")]
