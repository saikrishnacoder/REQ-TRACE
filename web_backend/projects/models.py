import uuid

from django.conf import settings
from django.db import models


class Workspace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160)
    key = models.SlugField(max_length=48, unique=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_workspaces")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["owner", "created_at"], name="sf_workspace_owner_idx")]

    def __str__(self):
        return self.name


class WorkspaceMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "Owner", "Owner"
        ADMIN = "Admin", "Admin"
        EDITOR = "Editor", "Editor"
        VIEWER = "Viewer", "Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="workspace_memberships")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.VIEWER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workspace", "user"], name="sf_workspace_member_unique")]
        indexes = [models.Index(fields=["user", "role"], name="sf_workspace_user_role_idx")]


class Project(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        ON_HOLD = "On Hold", "On Hold"
        COMPLETED = "Completed", "Completed"
        ARCHIVED = "Archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="projects")
    key = models.SlugField(max_length=48)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    objectives = models.JSONField(default=list, blank=True)
    project_type = models.CharField(max_length=80, blank=True)
    industry = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="specforge_projects")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [models.UniqueConstraint(fields=["workspace", "key"], name="sf_project_workspace_key_unique")]
        indexes = [
            models.Index(fields=["workspace", "status"], name="sf_project_ws_status_idx"),
            models.Index(fields=["workspace", "updated_at"], name="sf_project_ws_updated_idx"),
            models.Index(fields=["owner", "status"], name="sf_project_owner_status_idx"),
        ]

    def __str__(self):
        return f"{self.key}: {self.name}"


class ProjectMembership(models.Model):
    class Role(models.TextChoices):
        ADMINISTRATOR = "Project administrator", "Project administrator"
        BUSINESS_ANALYST = "Business analyst", "Business analyst"
        DEVELOPER = "Developer", "Developer"
        QA_ENGINEER = "QA engineer", "QA engineer"
        REVIEWER = "Reviewer", "Reviewer"
        VIEWER = "Viewer", "Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_memberships")
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.VIEWER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["project", "user"], name="sf_project_member_unique")]
        indexes = [models.Index(fields=["user", "role"], name="sf_project_user_role_idx")]


class ActivityLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.PROTECT, related_name="activity_events")
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name="activity_events")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="specforge_activity")
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=48, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["workspace", "created_at"], name="sf_activity_ws_date_idx"),
            models.Index(fields=["project", "created_at"], name="sf_activity_proj_date_idx"),
        ]
