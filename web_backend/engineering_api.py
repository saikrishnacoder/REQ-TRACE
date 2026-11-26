from django.db import transaction
from django.db.models import Q
from django.http import FileResponse
import mimetypes
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view

from accounts.authentication import SessionTokenAuthentication
from approvals.models import Approval
from audience_intelligence.models import Persona, Stakeholder
from business_intelligence.models import BusinessAnalysis, BusinessObjective
from design.models import DesignArtifact
from documents.models import SourceDocument
from projects.models import ActivityLog, Project, WorkspaceMembership
from requirements.models import Requirement, RequirementVersion
from testing.models import TestCase, TestExecution, TestSuite
from traceability.models import ArtefactRelationship
from engineering_serializers import (
    ApprovalDecisionSerializer, ApprovalSerializer, BusinessAnalysisSerializer,
    BusinessObjectiveSerializer, DesignArtifactSerializer, PersonaSerializer,
    RelationshipSerializer, RequirementSerializer, RequirementVersionSerializer,
    SourceDocumentSerializer, StakeholderSerializer, TestCaseSerializer,
    TestExecutionSerializer, TestSuiteSerializer,
)
from engineering_services import ApprovalService, BusinessAnalysisService, DesignArtifactService, ProjectAuditService, RequirementService


EDIT_ROLES = {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN, WorkspaceMembership.Role.EDITOR}
REVIEW_ROLES = {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN}


@extend_schema_view(
    list=extend_schema(description="Related requirement IDs: none available; the configured project database contains no approved requirements."),
    retrieve=extend_schema(description="Related requirement IDs: none available; the configured project database contains no approved requirements."),
    create=extend_schema(description="Related requirement IDs: none available; the configured project database contains no approved requirements."),
    update=extend_schema(description="Related requirement IDs: none available; the configured project database contains no approved requirements."),
    partial_update=extend_schema(description="Related requirement IDs: none available; the configured project database contains no approved requirements."),
    destroy=extend_schema(description="Related requirement IDs: none available; the configured project database contains no approved requirements."),
)
class ProjectScopedViewSet(viewsets.ModelViewSet):
    """Shared workspace boundary, CRUD authorization, filtering and audit attribution."""
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    search_fields = ()
    allowed_filters = ()
    project_lookup = "project"
    audit_name = "record"

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["project"] = self.get_project()
        return context

    def get_project(self):
        project_id = self.kwargs.get("project_id") or self.request.query_params.get("project")
        if not project_id:
            raise NotFound("Project not found.")
        project = Project.objects.filter(pk=project_id, workspace__memberships__user=self.request.user).select_related("workspace").first()
        if project is None:
            raise NotFound("Project not found.")
        return project

    def membership(self):
        return WorkspaceMembership.objects.filter(workspace=self.get_project().workspace, user=self.request.user).first()

    def require_edit(self):
        member = self.membership()
        if member is None or member.role not in EDIT_ROLES:
            raise PermissionDenied("An Owner, Admin, or Editor workspace role is required.")

    def require_review(self):
        member = self.membership()
        if member is None or member.role not in REVIEW_ROLES:
            raise PermissionDenied("Only workspace Owners and Admins can review this record.")

    def get_queryset(self):
        project = self.get_project()
        queryset = super().get_queryset()
        if self.project_lookup == "test_case__project":
            queryset = queryset.filter(test_case__project=project)
        else:
            queryset = queryset.filter(**{f"{self.project_lookup}_id": project.pk})
        search = self.request.query_params.get("search", "").strip()
        if search and self.search_fields:
            expression = Q()
            for field in self.search_fields:
                expression |= Q(**{f"{field}__icontains": search})
            queryset = queryset.filter(expression)
        for field in self.allowed_filters:
            value = self.request.query_params.get(field)
            if value:
                queryset = queryset.filter(**{field: value})
        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        self.require_edit()
        project = self.get_project()
        values = {}
        if self.project_lookup == "project":
            values["project"] = project
        if hasattr(serializer.Meta.model, "created_by"):
            values["created_by"] = self.request.user
        if serializer.Meta.model is TestExecution:
            values["executed_by"] = self.request.user
        serializer.save(**values)
        if isinstance(serializer.instance, Requirement):
            RequirementService.record_initial_version(serializer.instance, self.request.user)
        self.write_activity("created", serializer.instance)

    def perform_update(self, serializer):
        self.require_edit()
        with transaction.atomic():
            instance = serializer.save()
            if isinstance(instance, Requirement):
                RequirementService.record_update(instance, self.request.user, self.request.data.get("change_reason", ""))
            self.write_activity("updated", instance)

    def perform_destroy(self, instance):
        self.require_review()
        with transaction.atomic():
            self.write_activity("deleted", instance)
            if isinstance(instance, SourceDocument) and instance.file:
                instance.file.delete(save=False)
            instance.delete()

    def write_activity(self, verb, instance, extra=None):
        project = self.get_project()
        return ProjectAuditService.record(project, self.request.user, f"{self.audit_name}.{verb}", self.audit_name, instance.pk, extra)


class RequirementViewSet(ProjectScopedViewSet):
    queryset = Requirement.objects.select_related("source_document", "created_by")
    serializer_class = RequirementSerializer
    search_fields = ("code", "title", "statement", "description")
    allowed_filters = ("status", "category", "priority")
    audit_name = "requirement"

    @action(detail=True, methods=["get"])
    def versions(self, request, project_id=None, pk=None):
        requirement = self.get_object()
        return Response(RequirementVersionSerializer(requirement.versions.all(), many=True).data)

    @action(detail=True, methods=["post"], url_path="submit-review")
    def submit_review(self, request, project_id=None, pk=None):
        self.require_edit()
        requirement = self.get_object()
        if requirement.status not in {Requirement.Status.DRAFT, Requirement.Status.REJECTED}:
            raise ValidationError("Only draft or rejected requirements can be submitted for review.")
        with transaction.atomic():
            approval = RequirementService.submit_for_review(requirement, request.user, str(request.data.get("comment", "")))
            self.write_activity("submitted_for_review", requirement, {"approval_id": str(approval.pk), "version": requirement.current_version})
        return Response(ApprovalSerializer(approval).data, status=status.HTTP_201_CREATED)


class SourceDocumentViewSet(ProjectScopedViewSet):
    queryset = SourceDocument.objects.all()
    serializer_class = SourceDocumentSerializer
    search_fields = ("filename",)
    allowed_filters = ("extraction_status",)
    audit_name = "source_document"

    def update(self, request, *args, **kwargs):
        raise ValidationError("Source document contents are immutable. Upload a new source document version.")

    partial_update = update

    @action(detail=True, methods=["get"])
    @extend_schema(responses={200: OpenApiResponse(response=OpenApiTypes.BINARY, description="Authenticated download of the project source document")})
    def download(self, request, project_id=None, pk=None):
        document = self.get_object()
        if not document.file:
            raise NotFound("Document file not found.")
        try:
            stream = document.file.open("rb")
        except OSError as exc:
            raise NotFound("Document file is unavailable in storage.") from exc
        guessed_type = mimetypes.guess_type(document.filename)[0] or "application/octet-stream"
        response = FileResponse(stream, as_attachment=True, filename=document.filename, content_type=guessed_type)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class DesignArtifactViewSet(ProjectScopedViewSet):
    queryset = DesignArtifact.objects.select_related("created_by")
    serializer_class = DesignArtifactSerializer
    search_fields = ("title",)
    allowed_filters = ("kind",)
    audit_name = "design_artifact"

    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @transaction.atomic
    def perform_create(self, serializer):
        self.require_edit()
        project = self.get_project()
        serializer.save(project=project, version=1, created_by=self.request.user)
        self.write_activity("version_created", serializer.instance, {"version": 1})

    @extend_schema(responses={201: DesignArtifactSerializer})
    def update(self, request, *args, **kwargs):
        self.require_edit()
        previous = self.get_object()
        if request.data.get("kind", previous.kind) != previous.kind or request.data.get("title", previous.title) != previous.title:
            raise ValidationError("Design kind and title identify an artifact series and cannot change between versions.")
        payload = {"kind": previous.kind, "title": previous.title, "content": previous.content, "source_evidence": previous.source_evidence}
        payload.update(request.data)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        latest = DesignArtifact.objects.filter(project=previous.project, kind=previous.kind, title=previous.title).order_by("-version").first()
        with transaction.atomic():
            next_artifact = DesignArtifactService.create_version(previous, serializer.validated_data, request.user)
            self.write_activity("version_created", next_artifact, {"supersedes": str(previous.pk), "version": next_artifact.version})
        return Response(self.get_serializer(next_artifact).data, status=status.HTTP_201_CREATED)

    partial_update = update

    @action(detail=True, methods=["post"], url_path="submit-review")
    @transaction.atomic
    def submit_review(self, request, project_id=None, pk=None):
        self.require_edit()
        artifact = self.get_object()
        approval = request_approval(self, artifact, "DesignArtifact", artifact.version, request.data.get("comment", ""))
        return Response(ApprovalSerializer(approval).data, status=status.HTTP_201_CREATED)


class BusinessAnalysisViewSet(ProjectScopedViewSet):
    queryset = BusinessAnalysis.objects.all()
    serializer_class = BusinessAnalysisSerializer
    allowed_filters = ("status",)
    audit_name = "business_analysis"

    @transaction.atomic
    def perform_create(self, serializer):
        self.require_edit()
        project = self.get_project()
        serializer.instance = BusinessAnalysisService.next_version(project, serializer.validated_data, self.request.user)
        self.write_activity("created", serializer.instance, {"version": serializer.instance.version})

    @extend_schema(responses={201: BusinessAnalysisSerializer})
    def update(self, request, *args, **kwargs):
        self.require_edit()
        previous = self.get_object()
        payload = {"problem": previous.problem, "proposed_solution": previous.proposed_solution, "expected_value": previous.expected_value, "success_metrics": previous.success_metrics, "constraints": previous.constraints, "risks": previous.risks, "assumptions": previous.assumptions, "evidence": previous.evidence}
        payload.update(request.data)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            analysis = BusinessAnalysisService.next_version(previous.project, serializer.validated_data, request.user)
            self.write_activity("version_created", analysis, {"supersedes": str(previous.pk), "version": analysis.version})
        return Response(self.get_serializer(analysis).data, status=status.HTTP_201_CREATED)

    partial_update = update

class BusinessObjectiveViewSet(ProjectScopedViewSet):
    queryset = BusinessObjective.objects.all()
    serializer_class = BusinessObjectiveSerializer
    search_fields = ("title", "description")
    audit_name = "business_objective"


class StakeholderViewSet(ProjectScopedViewSet):
    queryset = Stakeholder.objects.all()
    serializer_class = StakeholderSerializer
    search_fields = ("name", "role", "organization")
    audit_name = "stakeholder"


class PersonaViewSet(ProjectScopedViewSet):
    queryset = Persona.objects.all()
    serializer_class = PersonaSerializer
    search_fields = ("name", "role")
    allowed_filters = ("validation_state",)
    audit_name = "persona"

    @action(detail=True, methods=["post"])
    def validate(self, request, project_id=None, pk=None):
        self.require_review()
        persona = self.get_object()
        with transaction.atomic():
            persona.validation_state = Persona.ValidationState.VALIDATED
            persona.save(update_fields=["validation_state", "updated_at"])
            self.write_activity("validated", persona)
        return Response(self.get_serializer(persona).data)


class TestSuiteViewSet(ProjectScopedViewSet):
    queryset = TestSuite.objects.all()
    serializer_class = TestSuiteSerializer
    search_fields = ("name", "description")
    audit_name = "test_suite"


class TestCaseViewSet(ProjectScopedViewSet):
    queryset = TestCase.objects.select_related("suite", "requirement", "created_by")
    serializer_class = TestCaseSerializer
    search_fields = ("code", "title", "expected_result")
    allowed_filters = ("status", "priority", "test_type")
    audit_name = "test_case"


class TestExecutionViewSet(ProjectScopedViewSet):
    queryset = TestExecution.objects.select_related("test_case", "executed_by").order_by("-executed_at")
    serializer_class = TestExecutionSerializer
    project_lookup = "test_case__project"
    audit_name = "test_execution"

    def update(self, request, *args, **kwargs):
        raise ValidationError("Test executions are append-only; create a new execution record.")

    partial_update = update

    def perform_destroy(self, instance):
        raise ValidationError("Test executions are append-only and cannot be deleted.")


class RelationshipViewSet(ProjectScopedViewSet):
    queryset = ArtefactRelationship.objects.all()
    serializer_class = RelationshipSerializer
    allowed_filters = ("status", "relationship_type", "origin")
    audit_name = "traceability_link"

    @transaction.atomic
    def perform_create(self, serializer):
        self.require_edit()
        project = self.get_project()
        validate_artifact_ref(project, serializer.validated_data["source_type"], serializer.validated_data["source_id"])
        validate_artifact_ref(project, serializer.validated_data["target_type"], serializer.validated_data["target_id"])
        with transaction.atomic():
            serializer.save(project=project, origin=ArtefactRelationship.Origin.USER, status=ArtefactRelationship.Status.PROPOSED, created_by=self.request.user)
            self.write_activity("proposed", serializer.instance, {"relationship_type": serializer.instance.relationship_type})

    @action(detail=True, methods=["post"])
    def confirm(self, request, project_id=None, pk=None):
        self.require_review()
        relationship = self.get_object()
        with transaction.atomic():
            relationship.status = ArtefactRelationship.Status.CONFIRMED
            relationship.save(update_fields=["status"])
            self.write_activity("confirmed", relationship)
        return Response(self.get_serializer(relationship).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, project_id=None, pk=None):
        self.require_review()
        relationship = self.get_object()
        with transaction.atomic():
            relationship.status = ArtefactRelationship.Status.REJECTED
            relationship.save(update_fields=["status"])
            self.write_activity("rejected", relationship)
        return Response(self.get_serializer(relationship).data)


def validate_artifact_ref(project, artefact_type, artefact_id):
    models = {
        "SourceDocument": SourceDocument, "Requirement": Requirement, "DesignArtifact": DesignArtifact,
        "BusinessAnalysis": BusinessAnalysis, "BusinessObjective": BusinessObjective, "Stakeholder": Stakeholder,
        "Persona": Persona, "TestSuite": TestSuite, "TestCase": TestCase, "TestExecution": TestExecution,
    }
    model = models.get(artefact_type)
    if model is None or not model.objects.filter(project=project, pk=artefact_id).exists():
        raise ValidationError("The related artefact must exist in this project and use a supported artefact type.")


def request_approval(view, artefact, artefact_type, version, comment=""):
    view.require_edit()
    project = view.get_project()
    approval, _ = ApprovalService.request(project, view.request.user, artefact_type, artefact.pk, version, str(comment))
    return approval


class ApprovalViewSet(ProjectScopedViewSet):
    queryset = Approval.objects.select_related("requested_by", "reviewer")
    serializer_class = ApprovalSerializer
    allowed_filters = ("decision", "artefact_type")
    audit_name = "approval"

    @transaction.atomic
    def perform_create(self, serializer):
        self.require_edit()
        project = self.get_project()
        data = serializer.validated_data
        model_version = {
            "Requirement": (Requirement, "current_version"),
            "DesignArtifact": (DesignArtifact, "version"),
            "BusinessAnalysis": (BusinessAnalysis, "version"),
            "BusinessObjective": (BusinessObjective, None),
            "SourceDocument": (SourceDocument, None),
        }.get(data["artefact_type"])
        if model_version is None:
            raise ValidationError({"artefact_type": "This artefact type cannot be submitted for approval."})
        model, version_field = model_version
        target = model.objects.filter(project=project, pk=data["artefact_id"]).first()
        if target is None:
            raise ValidationError({"artefact_id": "The artefact must exist in this project."})
        actual_version = getattr(target, version_field) if version_field else 1
        if actual_version != data["artefact_version"]:
            raise ValidationError({"artefact_version": "The submitted version is not the current version."})
        if isinstance(target, Requirement) and target.status not in {Requirement.Status.DRAFT, Requirement.Status.REJECTED}:
            raise ValidationError({"artefact_id": "Only Draft or Rejected requirements can be submitted for approval."})
        if isinstance(target, BusinessAnalysis) and target.status not in {BusinessAnalysis.Status.DRAFT, BusinessAnalysis.Status.REJECTED}:
            raise ValidationError({"artefact_id": "Only Draft or Rejected business analyses can be submitted for approval."})
        if Approval.objects.filter(project=project, artefact_type=data["artefact_type"], artefact_id=target.pk, artefact_version=actual_version, decision=Approval.Decision.APPROVED).exists():
            raise ValidationError({"artefact_version": "This artifact version has already been approved; create a new version."})
        if isinstance(target, SourceDocument) and target.extraction_status != SourceDocument.Status.READY:
            raise ValidationError({"artefact_id": "Only documents with completed extraction can be approved."})
        approval, created = ApprovalService.request(project, self.request.user, data["artefact_type"], target.pk, actual_version, data.get("comment", ""))
        serializer.instance = approval
        if not created:
            self._existing = approval

    def create(self, request, *args, **kwargs):
        self._existing = None
        response = super().create(request, *args, **kwargs)
        if self._existing:
            return Response(self.get_serializer(self._existing).data, status=status.HTTP_200_OK)
        return response

    @action(detail=True, methods=["post"], url_path="decision")
    def decide(self, request, project_id=None, pk=None):
        self.require_review()
        approval = self.get_object()
        if approval.decision != Approval.Decision.PENDING:
            raise ValidationError("Only pending approval requests can be decided.")
        serializer = ApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approval = ApprovalService.decide(approval, request.user, serializer.validated_data["decision"], serializer.validated_data.get("comment", ""))
        return Response(self.get_serializer(approval).data)
