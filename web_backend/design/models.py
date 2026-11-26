import uuid

from django.conf import settings
from django.db import models


class DesignArtifact(models.Model):
    class Kind(models.TextChoices):
        USER_FLOW = "User flow", "User flow"
        ARCHITECTURE = "Architecture", "Architecture"
        COMPONENT = "Component architecture", "Component architecture"
        DATABASE = "Database design", "Database design"
        API = "API specification", "API specification"
        DATA_FLOW = "Data flow", "Data flow"
        SECURITY = "Security review", "Security review"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey("projects.Project", on_delete=models.CASCADE, related_name="design_artifacts")
    kind = models.CharField(max_length=32, choices=Kind.choices)
    title = models.CharField(max_length=240)
    version = models.PositiveIntegerField(default=1)
    content = models.JSONField(default=dict, blank=True)
    source_evidence = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="design_artifacts_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "kind", "title", "version"], name="sf_design_artifact_version_unique")]
        indexes = [models.Index(fields=["project", "kind", "updated_at"], name="sf_design_project_kind_idx")]
