import uuid

from django.conf import settings
from django.db import models


class BusinessAnalysis(models.Model):
    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        IN_REVIEW = "In Review", "In Review"
        APPROVED = "Approved", "Approved"
        REJECTED = "Rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="business_analyses")
    version = models.PositiveIntegerField(default=1)
    problem = models.TextField(blank=True)
    proposed_solution = models.TextField(blank=True)
    expected_value = models.TextField(blank=True)
    success_metrics = models.JSONField(default=list, blank=True)
    constraints = models.JSONField(default=list, blank=True)
    risks = models.JSONField(default=list, blank=True)
    assumptions = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    evidence = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="business_analyses_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "version"], name="sf_business_analysis_version_unique")]
        indexes = [models.Index(fields=["project", "status"], name="sf_business_project_status_idx")]


class BusinessObjective(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="business_objectives")
    title = models.CharField(max_length=240)
    description = models.TextField(blank=True)
    success_metric = models.CharField(max_length=240, blank=True)
    source_evidence = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["project", "created_at"], name="sf_objective_project_idx")]
