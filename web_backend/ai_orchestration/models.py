import uuid

from django.conf import settings
from django.db import models


class AIRun(models.Model):
    class Status(models.TextChoices):
        QUEUED = "Queued", "Queued"
        RUNNING = "Running", "Running"
        SUCCEEDED = "Succeeded", "Succeeded"
        FAILED = "Failed", "Failed"
        CANCELLED = "Cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="ai_runs")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="specforge_ai_runs")
    task_type = models.CharField(max_length=80)
    provider = models.CharField(max_length=80, blank=True)
    model = models.CharField(max_length=120, blank=True)
    prompt_version = models.CharField(max_length=80, blank=True)
    idempotency_key = models.CharField(max_length=128, null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    input_payload = models.JSONField(default=dict, blank=True)
    output_payload = models.JSONField(default=dict, blank=True)
    error_message = models.CharField(max_length=1000, blank=True)
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    estimated_cost = models.DecimalField(max_digits=12, decimal_places=6, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "idempotency_key"], name="sf_ai_project_idempotency_unique")]
        indexes = [
            models.Index(fields=["project", "status", "created_at"], name="sf_ai_project_status_idx"),
            models.Index(fields=["requested_by", "created_at"], name="sf_ai_user_created_idx"),
        ]
