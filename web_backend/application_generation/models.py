import uuid

from django.conf import settings
from django.db import models


class GenerationPlan(models.Model):
    class State(models.TextChoices):
        PENDING_REVIEW = "Pending review", "Pending review"
        APPROVED = "Approved", "Approved"
        REJECTED = "Rejected", "Rejected"
        SUPERSEDED = "Superseded", "Superseded"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="generation_plans")
    version = models.PositiveIntegerField()
    state = models.CharField(max_length=20, choices=State.choices, default=State.PENDING_REVIEW)
    source_snapshot = models.JSONField()
    source_hash = models.CharField(max_length=64)
    plan = models.JSONField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="generation_plans_created")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="generation_plans_reviewed")
    review_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-version"]
        constraints = [models.UniqueConstraint(fields=["project", "version"], name="sf_gen_plan_project_version_uq")]
        indexes = [models.Index(fields=["project", "state", "created_at"], name="sf_gen_plan_project_state_idx")]


class GenerationRun(models.Model):
    class State(models.TextChoices):
        QUEUED = "Queued", "Queued"
        RUNNING = "Running", "Running"
        SUCCEEDED = "Succeeded", "Succeeded"
        FAILED = "Failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    plan = models.ForeignKey(GenerationPlan, on_delete=models.CASCADE, related_name="runs")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="application_generation_runs")
    idempotency_key = models.CharField(max_length=128)
    state = models.CharField(max_length=12, choices=State.choices, default=State.QUEUED)
    provider = models.CharField(max_length=80)
    model = models.CharField(max_length=120)
    error_message = models.CharField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["plan", "idempotency_key"], name="sf_gen_run_plan_idem_uq")]
        indexes = [models.Index(fields=["state", "created_at"], name="sf_gen_run_queue_idx")]


class GeneratedFile(models.Model):
    class ReviewState(models.TextChoices):
        PROPOSED = "Proposed", "Proposed"
        APPROVED = "Approved", "Approved"
        REJECTED = "Rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(GenerationRun, on_delete=models.CASCADE, related_name="files")
    path = models.CharField(max_length=500)
    content = models.TextField()
    sha256 = models.CharField(max_length=64)
    requirement_ids = models.JSONField(default=list, blank=True)
    summary = models.CharField(max_length=500, blank=True)
    review_state = models.CharField(max_length=12, choices=ReviewState.choices, default=ReviewState.PROPOSED)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="generated_files_reviewed")
    review_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["run", "path"], name="sf_gen_file_run_path_uq")]
        indexes = [models.Index(fields=["run", "review_state"], name="sf_gen_file_run_review_idx")]
