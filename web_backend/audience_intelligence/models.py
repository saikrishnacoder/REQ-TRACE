import uuid

from django.db import models


class Stakeholder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="stakeholders")
    name = models.CharField(max_length=180)
    role = models.CharField(max_length=120, blank=True)
    organization = models.CharField(max_length=180, blank=True)
    needs = models.JSONField(default=list, blank=True)
    evidence = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["project", "role"], name="sf_stakeholder_proj_role")]


class Persona(models.Model):
    class ValidationState(models.TextChoices):
        DRAFT = "Draft", "Draft"
        RESEARCH_SUPPORTED = "Research supported", "Research supported"
        VALIDATED = "Validated", "Validated"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="personas")
    name = models.CharField(max_length=180)
    role = models.CharField(max_length=120)
    goals = models.JSONField(default=list, blank=True)
    needs = models.JSONField(default=list, blank=True)
    pain_points = models.JSONField(default=list, blank=True)
    expectations = models.JSONField(default=list, blank=True)
    evidence = models.JSONField(default=list, blank=True)
    validation_state = models.CharField(max_length=24, choices=ValidationState.choices, default=ValidationState.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["project", "validation_state"], name="sf_persona_project_state_idx")]
