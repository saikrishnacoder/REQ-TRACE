from rest_framework.permissions import BasePermission

from projects.models import WorkspaceMembership


class CanManageWorkspaceProjects(BasePermission):
    """Only workspace Owner/Admin/Editor can create or update projects."""

    edit_roles = {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN, WorkspaceMembership.Role.EDITOR}

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

    def has_object_permission(self, request, view, project):
        membership = WorkspaceMembership.objects.filter(workspace=project.workspace, user=request.user).first()
        if membership is None:
            return False
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return True
        if request.method == "DELETE":
            return membership.role in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN}
        return membership.role in self.edit_roles
