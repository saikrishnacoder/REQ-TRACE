from rest_framework import serializers

from projects.models import ActivityLog, Project, Workspace, WorkspaceMembership


class WorkspaceSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="_membership_role", read_only=True)

    class Meta:
        model = Workspace
        fields = ["id", "name", "key", "role", "created_at", "updated_at"]
        read_only_fields = ["id", "role", "created_at", "updated_at"]


class WorkspaceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ["name", "key"]


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = [
            "id", "workspace", "key", "name", "description", "objectives", "project_type",
            "industry", "status", "owner", "created_at", "updated_at", "archived_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at", "archived_at"]


class WorkspaceMemberSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="user_id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    email = serializers.EmailField(write_only=True)
    role = serializers.ChoiceField(choices=WorkspaceMembership.Role.choices)


class ActivitySerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True, allow_null=True)

    class Meta:
        model = ActivityLog
        fields = ["id", "action", "target_type", "target_id", "details", "actor_username", "created_at"]
