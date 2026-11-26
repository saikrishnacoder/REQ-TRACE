import io
import re
import zipfile

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse
from rest_framework import permissions, status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.authentication import SessionTokenAuthentication
from application_generation.models import GeneratedFile, GenerationPlan, GenerationRun
from application_generation.provider import GeneratedCodeFile, ProviderConfigurationError, provider_config
from application_generation.serializers import EditBlueprintSerializer, GeneratedFileSerializer, GenerationPlanSerializer, GenerationRunRequestSerializer, GenerationRunSerializer, ReviewGeneratedFileSerializer, ReviewPlanSerializer
from application_generation.services import create_plan, readiness, review_plan, build_source_snapshot, canonical_json, queue_generation_run, unresolved_clarifications
from application_generation.scaffolding import build_scaffold_files
from projects.models import ActivityLog, Project, WorkspaceMembership


class GenerationConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "generation_inputs_not_ready"
    default_detail = "Approved project inputs are required before a generation plan can be created."


class ProviderUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "generation_provider_unavailable"
    default_detail = "Application code generation is not configured on this backend."


class GenerationAccessMixin:
    authentication_classes = [SessionTokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, request, project_id, *, write=False):
        membership = WorkspaceMembership.objects.select_related("workspace").filter(
            workspace__projects__id=project_id, workspace__memberships__user=request.user, user=request.user,
        ).first()
        if membership is None:
            raise NotFound("Project not found.")
        if write and membership.role not in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN, WorkspaceMembership.Role.EDITOR}:
            raise PermissionDenied("Your workspace role cannot manage application generation plans.")
        return Project.objects.get(pk=project_id, workspace=membership.workspace)

    def get_generation_plan(self, request, plan_id):
        plan = GenerationPlan.objects.select_related("project", "project__workspace", "created_by", "reviewed_by").filter(
            pk=plan_id, project__workspace__memberships__user=request.user,
        ).first()
        if plan is None:
            raise NotFound("Generation plan not found.")
        return plan


class GenerationReadinessView(GenerationAccessMixin, APIView):
    @extend_schema(operation_id="application_generation_readiness", responses=dict)
    def get(self, request, project_id):
        project = self.get_project(request, project_id)
        return Response(readiness(project))


class GenerationPlanListCreateView(GenerationAccessMixin, APIView):
    @extend_schema(operation_id="application_generation_plan_list", responses=GenerationPlanSerializer(many=True))
    def get(self, request, project_id):
        project = self.get_project(request, project_id)
        plans = GenerationPlan.objects.filter(project=project).select_related("created_by", "reviewed_by")
        return Response(GenerationPlanSerializer(plans, many=True).data)

    @extend_schema(operation_id="application_generation_plan_create", request=None, responses={201: GenerationPlanSerializer, 409: dict})
    def post(self, request, project_id):
        project = self.get_project(request, project_id, write=True)
        current_readiness = readiness(project)
        if not current_readiness["ready"]:
            raise GenerationConflict({"message": "Generation is blocked until approved inputs are complete.", "readiness": current_readiness})
        with transaction.atomic():
            plan = create_plan(project, request.user)
            ActivityLog.objects.create(
                workspace=project.workspace, project=project, actor=request.user,
                action="application_generation.plan_created", target_type="generation_plan",
                target_id=str(plan.pk), details={"version": plan.version, "source_hash": plan.source_hash},
            )
        return Response(GenerationPlanSerializer(plan).data, status=status.HTTP_201_CREATED)


class GenerationPlanDetailView(GenerationAccessMixin, APIView):
    @extend_schema(operation_id="application_generation_plan_detail", responses=GenerationPlanSerializer)
    def get(self, request, plan_id):
        return Response(GenerationPlanSerializer(self.get_generation_plan(request, plan_id)).data)

    @extend_schema(operation_id="application_blueprint_edit", request=EditBlueprintSerializer, responses=GenerationPlanSerializer)
    def patch(self, request, plan_id):
        plan = self.get_generation_plan(request, plan_id)
        self.get_project(request, plan.project_id, write=True)
        if plan.state != GenerationPlan.State.PENDING_REVIEW:
            raise GenerationConflict("Only a blueprint awaiting review can be edited. Create a new blueprint version.")
        serializer = EditBlueprintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        editable = serializer.validated_data["blueprint"]
        with transaction.atomic():
            plan.plan = {**plan.plan, **editable}
            plan.save(update_fields=["plan"])
            ActivityLog.objects.create(
                workspace=plan.project.workspace, project=plan.project, actor=request.user,
                action="application_blueprint.edited", target_type="generation_plan", target_id=str(plan.pk),
                details={"sections": sorted(editable.keys()), "version": plan.version},
            )
        return Response(GenerationPlanSerializer(plan).data)


class ScaffoldArchiveView(GenerationAccessMixin, APIView):
    """Return an archive only; the server never writes into an existing project directory."""

    @extend_schema(operation_id="application_scaffold_download", request=None, responses={200: OpenApiResponse(response=OpenApiTypes.BINARY, description="Approved React and Django starter project ZIP")})
    def post(self, request, plan_id):
        plan = self.get_generation_plan(request, plan_id)
        project = self.get_project(request, plan.project_id, write=True)
        if plan.state != GenerationPlan.State.APPROVED:
            raise GenerationConflict("Approve the application blueprint before scaffolding.")
        try:
            current_snapshot = build_source_snapshot(project)
        except ValueError as exc:
            raise GenerationConflict("Approved source inputs changed or are no longer complete. Create a new blueprint.") from exc
        if canonical_json(current_snapshot) != canonical_json(plan.source_snapshot):
            raise GenerationConflict("Approved source inputs changed after blueprint approval. Create and approve a new blueprint.")

        files = build_scaffold_files(plan)
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path, content in sorted(files.items()):
                archive.writestr(path, content)
        ActivityLog.objects.create(
            workspace=project.workspace, project=project, actor=request.user,
            action="application_generation.scaffold_downloaded", target_type="generation_plan",
            target_id=str(plan.pk), details={"version": plan.version, "file_count": len(files), "source_hash": plan.source_hash},
        )
        response = HttpResponse(output.getvalue(), content_type="application/zip")
        archive_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", project.name.strip().lower()).strip("-_")[:48] or "application"
        response["Content-Disposition"] = f'attachment; filename="{archive_name}-scaffold-v{plan.version}.zip"'
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class GenerationPlanReviewView(GenerationAccessMixin, APIView):
    @extend_schema(operation_id="application_generation_plan_approve", request=ReviewPlanSerializer, responses=GenerationPlanSerializer)
    def post(self, request, plan_id, decision):
        if decision not in {"approve", "reject"}:
            raise NotFound("Generation plan action not found.")
        plan = self.get_generation_plan(request, plan_id)
        membership = WorkspaceMembership.objects.filter(workspace=plan.project.workspace, user=request.user).first()
        if membership is None or membership.role not in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN}:
            raise PermissionDenied("Only workspace owners or administrators can approve generation plans.")
        serializer = ReviewPlanSerializer(data=request.data if request.data else {})
        serializer.is_valid(raise_exception=True)
        if plan.state != GenerationPlan.State.PENDING_REVIEW:
            raise GenerationConflict("Only a pending generation plan can be reviewed.")
        if decision == "approve" and unresolved_clarifications(plan.plan):
            raise GenerationConflict({
                "message": "Resolve every clarification question or mark it not applicable with a reason before approval.",
                "unresolved_topics": unresolved_clarifications(plan.plan),
            })
        try:
            current_snapshot = build_source_snapshot(plan.project)
        except ValueError:
            raise GenerationConflict("Approved source inputs changed or are no longer complete. Create a new plan.")
        if canonical_json(current_snapshot) != canonical_json(plan.source_snapshot):
            raise GenerationConflict("Approved source inputs changed after this plan was drafted. Create a new plan.")

        new_state = GenerationPlan.State.APPROVED if decision == "approve" else GenerationPlan.State.REJECTED
        with transaction.atomic():
            plan = review_plan(plan, request.user, new_state, serializer.validated_data.get("comment", ""))
            ActivityLog.objects.create(
                workspace=plan.project.workspace, project=plan.project, actor=request.user,
                action=f"application_generation.plan_{new_state.casefold().replace(' ', '_')}", target_type="generation_plan",
                target_id=str(plan.pk), details={"version": plan.version, "comment": plan.review_comment},
            )
        return Response(GenerationPlanSerializer(plan).data)


class GenerationRunListCreateView(GenerationAccessMixin, APIView):
    @extend_schema(operation_id="application_generation_run_create", request=GenerationRunRequestSerializer, responses={202: GenerationRunSerializer})
    def post(self, request, plan_id):
        plan = self.get_generation_plan(request, plan_id)
        self.get_project(request, plan.project_id, write=True)
        if plan.state != GenerationPlan.State.APPROVED:
            raise GenerationConflict("Approve the architecture plan before generating application code.")
        try:
            _, _, model = provider_config()
        except ProviderConfigurationError as exc:
            raise ProviderUnavailable(str(exc)) from exc
        serializer = GenerationRunRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                run = queue_generation_run(plan, request.user, serializer.validated_data["idempotency_key"])
                run.model = model
                run.save(update_fields=["model"])
                ActivityLog.objects.create(
                    workspace=plan.project.workspace, project=plan.project, actor=request.user,
                    action="application_generation.run_queued", target_type="generation_run", target_id=str(run.pk),
                    details={"plan_id": str(plan.pk), "state": run.state},
                )
        except ValueError as exc:
            raise GenerationConflict(str(exc)) from exc
        return Response(GenerationRunSerializer(run).data, status=status.HTTP_202_ACCEPTED)


class GenerationRunDetailView(GenerationAccessMixin, APIView):
    @extend_schema(operation_id="application_generation_run_detail", responses=GenerationRunSerializer)
    def get(self, request, run_id):
        run = GenerationRun.objects.select_related("plan", "plan__project").prefetch_related("files").filter(
            pk=run_id, plan__project__workspace__memberships__user=request.user,
        ).first()
        if run is None:
            raise NotFound("Generation run not found.")
        return Response(GenerationRunSerializer(run).data)


class GeneratedFileReviewView(GenerationAccessMixin, APIView):
    @extend_schema(operation_id="application_generation_file_review", request=ReviewGeneratedFileSerializer, responses=GeneratedFileSerializer)
    def post(self, request, file_id):
        generated_file = GeneratedFile.objects.select_related("run", "run__plan", "run__plan__project").filter(
            pk=file_id, run__plan__project__workspace__memberships__user=request.user,
        ).first()
        if generated_file is None:
            raise NotFound("Generated file not found.")
        membership = WorkspaceMembership.objects.filter(workspace=generated_file.run.plan.project.workspace, user=request.user).first()
        if membership is None or membership.role not in {WorkspaceMembership.Role.OWNER, WorkspaceMembership.Role.ADMIN}:
            raise PermissionDenied("Only workspace owners or administrators can review generated code.")
        if generated_file.run.state != GenerationRun.State.SUCCEEDED:
            raise GenerationConflict("A generated file can be reviewed only after its run succeeds.")
        if generated_file.review_state != GeneratedFile.ReviewState.PROPOSED:
            raise GenerationConflict("A reviewed file is immutable; create a new generation run to propose changes.")
        serializer = ReviewGeneratedFileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            generated_file.review_state = serializer.validated_data["decision"]
            generated_file.review_comment = serializer.validated_data.get("comment", "")
            generated_file.reviewed_by = request.user
            generated_file.reviewed_at = timezone.now()
            generated_file.save(update_fields=["review_state", "review_comment", "reviewed_by", "reviewed_at"])
            ActivityLog.objects.create(
                workspace=generated_file.run.plan.project.workspace, project=generated_file.run.plan.project,
                actor=request.user, action="application_generation.file_reviewed", target_type="generated_file",
                target_id=str(generated_file.pk), details={"path": generated_file.path, "decision": generated_file.review_state},
            )
        return Response(GeneratedFileSerializer(generated_file).data)


class GenerationRunDownloadView(GenerationAccessMixin, APIView):
    @extend_schema(operation_id="application_generation_download", responses={200: OpenApiResponse(response=OpenApiTypes.BINARY, description="ZIP of human-approved generated files")})
    def get(self, request, run_id):
        run = GenerationRun.objects.select_related("plan", "plan__project").prefetch_related("files").filter(
            pk=run_id, plan__project__workspace__memberships__user=request.user,
        ).first()
        if run is None:
            raise NotFound("Generation run not found.")
        files = list(run.files.order_by("path"))
        if run.state != GenerationRun.State.SUCCEEDED or not files:
            raise GenerationConflict("The generation run has no completed file proposal.")
        if any(item.review_state != GeneratedFile.ReviewState.APPROVED for item in files):
            raise GenerationConflict("Every generated file must be approved before the archive is available.")
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for item in files:
                safe_file = GeneratedCodeFile(path=item.path, content=item.content, requirement_ids=item.requirement_ids, summary=item.summary)
                archive.writestr(safe_file.path, safe_file.content)
        response = HttpResponse(output.getvalue(), content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="specforge-project-{run.pk}.zip"'
        response["Cache-Control"] = "private, no-store"
        return response
