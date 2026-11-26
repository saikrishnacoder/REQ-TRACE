import uuid

from django.conf import settings
from django.db import models


class Approval(models.Model):
    class Decision(models.TextChoices):
        PENDING = "Pending", "Pending"
        APPROVED = "Approved", "Approved"
        REJECTED = "Rejected", "Rejected"
        CHANGES_REQUESTED = "Changes requested", "Changes requested"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="approvals")
    artefact_type = models.CharField(max_length=48)
    artefact_id = models.UUIDField()
    artefact_version = models.PositiveIntegerField()
    decision = models.CharField(max_length=24, choices=Decision.choices, default=Decision.PENDING)
    comment = models.TextField(blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="approval_requests")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="approval_reviews")
    requested_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "artefact_type", "artefact_id", "artefact_version", "reviewer"], name="sf_approval_reviewer_version_unique")]
        indexes = [
            models.Index(fields=["project", "decision", "requested_at"], name="sf_approval_project_state_idx"),
            models.Index(fields=["artefact_type", "artefact_id", "artefact_version"], name="sf_approval_target_idx"),
        ]
