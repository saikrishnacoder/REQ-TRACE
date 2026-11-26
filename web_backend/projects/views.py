from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from accounts.authentication import SessionTokenAuthentication
from projects.models import ActivityLog, Project, Workspace, WorkspaceMembership
from projects.permissions import CanManageWorkspaceProjects
from projects.serializers import ActivitySerializer, ProjectSerializer, WorkspaceCreateSerializer, WorkspaceMemberSerializer, WorkspaceSerializer


class WorkspaceListCreateView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=WorkspaceSerializer(many=True))
    def get(self, request):
        memberships = WorkspaceMembership.objects.filter(user=request.user).select_related("workspace")
        results = []
        for membership in memberships:
            workspace = membership.workspace
            workspace._membership_role = membership.role
            results.append(WorkspaceSerializer(workspace).data)
        return Response(results)

    @extend_schema(request=WorkspaceCreateSerializer, responses={201: WorkspaceSerializer})
    @transaction.atomic
    def post(self, request):
        serializer = WorkspaceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = serializer.save(owner=request.user)
        WorkspaceMembership.objects.create(
            workspace=workspace, user=request.user, role=WorkspaceMembership.Role.OWNER
        )
        workspace._membership_role = WorkspaceMembership.Role.OWNER
        ActivityLog.objects.create(workspace=workspace, actor=request.user, action="workspace.created", target_type="workspace", target_id=str(workspace.pk))
        return Response(WorkspaceSerializer(workspace).data, status=status.HTTP_201_CREATED)


class ProjectListCreateView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=ProjectSerializer(many=True))
    def get(self, request):
        projects = Project.objects.filter(workspace__memberships__user=request.user).select_related("workspace", "owner")
        workspace_id = request.query_params.get("workspace")
        if workspace_id:
            projects = projects.filter(workspace_id=workspace_id)
        search = request.query_params.get("search", "").strip()
        if search:
            projects = projects.filter(name__icontains=search) | projects.filter(key__icontains=search)
        return Response(ProjectSerializer(projects.distinct(), many=True).data)

    @extend_schema(request=ProjectSerializer, responses={201: ProjectSerializer})
    def post(self, request):
        serializer = ProjectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = serializer.validated_data["workspace"]
        membership = WorkspaceMembership.objects.filter(workspace=workspace, user=request.user).first()
        if membership is None or membership.role not in CanManageWorkspaceProjects.edit_roles:
            raise PermissionDenied("You need an editor or higher workspace role to create projects.")
        with transaction.atomic():
            project = serializer.save(owner=request.user)
            ActivityLog.objects.create(workspace=workspace, project=project, actor=request.user, action="project.created", target_type="project", target_id=str(project.pk))
        return Response(ProjectSerializer(project).data, status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, request, project_id):
        project = Project.objects.select_related("workspace", "owner").filter(pk=project_id).first()
        if project is None:
            raise NotFound("Project not found.")
        if not CanManageWorkspaceProjects().has_object_permission(request, self, project):
            # Hide cross-workspace project existence.
            raise NotFound("Project not found.")
        return project

    @extend_schema(responses=ProjectSerializer)
    def get(self, request, project_id):
        return Response(ProjectSerializer(self.get_object(request, project_id)).data)

    @extend_schema(request=ProjectSerializer, responses=ProjectSerializer)
    def patch(self, request, project_id):
        project = self.get_object(request, project_id)
        if not CanManageWorkspaceProjects().has_object_permission(request, self, project):
            raise PermissionDenied("Your workspace role cannot edit projects.")
        serializer = ProjectSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "workspace" in serializer.validated_data and serializer.validated_data["workspace"].pk != project.workspace_id:
            raise PermissionDenied("Projects cannot be moved across workspaces through this endpoint.")
        old_values = {key: getattr(project, key) for key in serializer.validated_data}
        with transaction.atomic():
            serializer.save()
            changed = {key: {"from": str(old_values[key]), "to": str(value)} for key, value in serializer.validated_data.items() if old_values[key] != value}
            if changed:
                ActivityLog.objects.create(workspace=project.workspace, project=project, actor=request.user, action="project.updated", target_type="project", target_id=str(project.pk), details=changed)
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request, project_id):
        project = self.get_object(request, project_id)
        membership = WorkspaceMembership.objects.filter(workspace=project.workspace, user=request.user).first()
        if membership is None or membership.role not in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN}:
            raise PermissionDenied("Only workspace owners or administrators may delete projects.")
        with transaction.atomic():
            ActivityLog.objects.create(workspace=project.workspace, project=project, actor=request.user, action="project.deleted", target_type="project", target_id=str(project.pk), details={"key": project.key, "name": project.name})
            project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectLifecycleView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    action = ""

    def perform(self, request, project_id):
        project = Project.objects.select_related("workspace", "owner").filter(pk=project_id, workspace__memberships__user=request.user).first()
        if project is None:
            raise NotFound("Project not found.")
        membership = WorkspaceMembership.objects.filter(workspace=project.workspace, user=request.user).first()
        if membership is None:
            raise NotFound("Project not found.")
        with transaction.atomic():
            if self.action == "duplicate":
                if membership.role not in CanManageWorkspaceProjects.edit_roles:
                    raise PermissionDenied("You need an editor or higher workspace role to duplicate projects.")
                base_key = f"{project.key[:40]}-copy"
                key = base_key
                number = 2
                while Project.objects.filter(workspace=project.workspace, key=key).exists():
                    key = f"{base_key[:43]}-{number}"
                    number += 1
                duplicate = Project.objects.create(
                    workspace=project.workspace, key=key, name=f"{project.name} (copy)",
                    description=project.description, objectives=project.objectives,
                    project_type=project.project_type, industry=project.industry, owner=request.user,
                )
                ActivityLog.objects.create(workspace=project.workspace, project=project, actor=request.user, action="project.duplicated", target_type="project", target_id=str(duplicate.pk), details={"source_project_id": str(project.pk)})
                ActivityLog.objects.create(workspace=project.workspace, project=duplicate, actor=request.user, action="project.created_from_duplicate", target_type="project", target_id=str(project.pk))
                return Response(ProjectSerializer(duplicate).data, status=status.HTTP_201_CREATED)

            if membership.role not in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN}:
                raise PermissionDenied("Only workspace owners or administrators may archive or restore projects.")
            if self.action == "archive":
                if project.status != Project.Status.ARCHIVED:
                    project.status = Project.Status.ARCHIVED
                    project.archived_at = timezone.now()
                    activity = "project.archived"
                else:
                    activity = None
            elif self.action == "restore":
                if project.status == Project.Status.ARCHIVED:
                    project.status = Project.Status.ACTIVE
                    project.archived_at = None
                    activity = "project.restored"
                else:
                    activity = None
            else:
                raise NotFound("Unknown project action.")
            if activity:
                project.save(update_fields=["status", "archived_at", "updated_at"])
                ActivityLog.objects.create(workspace=project.workspace, project=project, actor=request.user, action=activity, target_type="project", target_id=str(project.pk))
        return Response(ProjectSerializer(project).data)


class ArchiveProjectView(ProjectLifecycleView):
    action = "archive"

    @extend_schema(operation_id="project_archive", request=None, responses=ProjectSerializer)
    def post(self, request, project_id):
        return self.perform(request, project_id)


class RestoreProjectView(ProjectLifecycleView):
    action = "restore"

    @extend_schema(operation_id="project_restore", request=None, responses=ProjectSerializer)
    def post(self, request, project_id):
        return self.perform(request, project_id)


class DuplicateProjectView(ProjectLifecycleView):
    action = "duplicate"

    @extend_schema(operation_id="project_duplicate", request=None, responses={201: ProjectSerializer})
    def post(self, request, project_id):
        return self.perform(request, project_id)


class WorkspaceAccessMixin:
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_workspace(self, request, workspace_id):
        membership = WorkspaceMembership.objects.select_related("workspace").filter(workspace_id=workspace_id, user=request.user).first()
        if membership is None:
            raise NotFound("Workspace not found.")
        return membership.workspace, membership


class WorkspaceMembersView(WorkspaceAccessMixin, APIView):

    @extend_schema(responses=WorkspaceMemberSerializer(many=True))
    def get(self, request, workspace_id):
        workspace, _ = self.get_workspace(request, workspace_id)
        memberships = WorkspaceMembership.objects.filter(workspace=workspace).select_related("user").order_by("user__username")
        return Response([{"id": row.user_id, "username": row.user.username, "email": row.user.email, "role": row.role} for row in memberships])

    @extend_schema(request=WorkspaceMemberSerializer, responses={201: WorkspaceMemberSerializer})
    def post(self, request, workspace_id):
        workspace, actor_membership = self.get_workspace(request, workspace_id)
        if actor_membership.role not in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN}:
            raise PermissionDenied("Only workspace owners and administrators can manage members.")
        serializer = WorkspaceMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        user = get_user_model().objects.filter(email__iexact=email, is_active=True).first()
        if user is None:
            raise NotFound("An active SpecForge user with that email was not found.")
        role = serializer.validated_data["role"]
        if role == WorkspaceMembership.Role.OWNER:
            raise PermissionDenied("The owner role is assigned only to the workspace creator.")
        with transaction.atomic():
            membership, created = WorkspaceMembership.objects.get_or_create(workspace=workspace, user=user, defaults={"role": role})
            if not created:
                membership.role = role
                membership.save(update_fields=["role"])
            ActivityLog.objects.create(workspace=workspace, actor=request.user, action="workspace.member_added" if created else "workspace.member_role_changed", target_type="user", target_id=str(user.pk), details={"role": role})
        return Response({"id": user.pk, "username": user.username, "email": user.email, "role": membership.role}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class WorkspaceMemberDetailView(WorkspaceAccessMixin, APIView):
    @extend_schema(request=None, responses={204: None})
    def delete(self, request, workspace_id, user_id):
        workspace, actor_membership = self.get_workspace(request, workspace_id)
        if actor_membership.role not in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN}:
            raise PermissionDenied("Only workspace owners and administrators can remove members.")
        membership = WorkspaceMembership.objects.filter(workspace=workspace, user_id=user_id).first()
        if membership is None:
            raise NotFound("Workspace member not found.")
        if membership.role == WorkspaceMembership.Role.OWNER or workspace.owner_id == membership.user_id:
            raise PermissionDenied("The workspace owner cannot be removed.")
        with transaction.atomic():
            ActivityLog.objects.create(workspace=workspace, actor=request.user, action="workspace.member_removed", target_type="user", target_id=str(user_id), details={"role": membership.role})
            membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectActivityView(APIView):
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=ActivitySerializer(many=True))
    def get(self, request, project_id):
        project = Project.objects.filter(pk=project_id, workspace__memberships__user=request.user).first()
        if project is None:
            raise NotFound("Project not found.")
        events = ActivityLog.objects.filter(project=project).select_related("actor")[:100]
        return Response(ActivitySerializer(events, many=True).data)
