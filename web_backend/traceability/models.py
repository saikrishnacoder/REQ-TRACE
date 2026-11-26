import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class ArtefactRelationship(models.Model):
    class Origin(models.TextChoices):
        USER = "User", "User"
        IMPORT = "Import", "Import"
        AI_SUGGESTED = "AI suggested", "AI suggested"

    class Status(models.TextChoices):
        PROPOSED = "Proposed", "Proposed"
        CONFIRMED = "Confirmed", "Confirmed"
        REJECTED = "Rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="artefact_relationships")
    source_type = models.CharField(max_length=48)
    source_id = models.UUIDField()
    target_type = models.CharField(max_length=48)
    target_id = models.UUIDField()
    relationship_type = models.CharField(max_length=48)
    origin = models.CharField(max_length=16, choices=Origin.choices, default=Origin.USER)
    confidence = models.DecimalField(max_digits=4, decimal_places=3, null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(1)])
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PROPOSED)
    evidence = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="artefact_relationships_created")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "source_type", "source_id", "target_type", "target_id", "relationship_type"], name="sf_artefact_relationship_unique")]
        indexes = [
            models.Index(fields=["project", "source_type", "source_id"], name="sf_link_project_source_idx"),
            models.Index(fields=["project", "target_type", "target_id"], name="sf_link_project_target_idx"),
            models.Index(fields=["project", "status"], name="sf_link_project_status_idx"),
        ]
