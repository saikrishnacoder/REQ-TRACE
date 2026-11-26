import hashlib
import os
import uuid

from django.db.models import Q

from rest_framework import serializers

from approvals.models import Approval
from audience_intelligence.models import Persona, Stakeholder
from business_intelligence.models import BusinessAnalysis, BusinessObjective
from design.models import DesignArtifact
from documents.models import SourceDocument
from projects.models import Project
from requirements.models import Requirement, RequirementVersion
from testing.models import TestCase, TestExecution, TestSuite
from traceability.models import ArtefactRelationship


class ProjectBoundSerializer(serializers.ModelSerializer):
    def validate_source_document(self, value):
        project = self.context.get("project")
        if value and value.project_id != project.pk:
            raise serializers.ValidationError("Source document must belong to this project.")
        return value

    def validate(self, attrs):
        project = self.context.get("project")
        for field in ("suite", "requirement"):
            related = attrs.get(field)
            if related and related.project_id != project.pk:
                raise serializers.ValidationError({field: "Related record must belong to this project."})
        return attrs


class RequirementSerializer(ProjectBoundSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, allow_null=True)

    class Meta:
        model = Requirement
        fields = ["id", "project", "source_document", "code", "title", "description", "statement", "category", "priority", "status", "approval_state", "stakeholder", "acceptance_criteria", "dependencies", "source_page", "source_section", "current_version", "created_by", "created_by_username", "created_at", "updated_at"]
        read_only_fields = ["id", "project", "status", "approval_state", "current_version", "created_by", "created_by_username", "created_at", "updated_at"]

    def validate_acceptance_criteria(self, value):
        if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
            raise serializers.ValidationError("Acceptance criteria must be a list of non-empty strings.")
        if len(value) > 100:
            raise serializers.ValidationError("No more than 100 acceptance criteria are allowed.")
        return [item.strip() for item in value]

    def validate_dependencies(self, value):
        if not isinstance(value, list) or len(value) > 100:
            raise serializers.ValidationError("Dependencies must be a list of at most 100 requirement IDs or codes.")
        if any(not isinstance(item, str) or not item.strip() for item in value):
            raise serializers.ValidationError("Each dependency must be a requirement ID or code.")
        project = self.context.get("project")
        for dependency in value:
            try:
                dependency_id = uuid.UUID(dependency)
            except ValueError:
                dependency_id = None
            matches = Requirement.objects.filter(project=project).filter(Q(code=dependency) | Q(pk=dependency_id) if dependency_id else Q(code=dependency))
            if not matches.exists():
                raise serializers.ValidationError(f"Dependency '{dependency}' does not exist in this project.")
            if self.instance and matches.filter(pk=self.instance.pk).exists():
                raise serializers.ValidationError("A requirement cannot depend on itself.")
        return value


class RequirementVersionSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, allow_null=True)

    class Meta:
        model = RequirementVersion
        fields = ["id", "requirement", "version", "snapshot", "change_reason", "created_by_username", "created_at"]
        read_only_fields = fields


class SourceDocumentSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=True)

    class Meta:
        model = SourceDocument
        fields = ["id", "project", "filename", "file", "media_type", "byte_size", "sha256", "extracted_text", "extraction_status", "extraction_error", "created_by", "created_at"]
        read_only_fields = ["id", "project", "filename", "media_type", "byte_size", "sha256", "extracted_text", "extraction_status", "extraction_error", "created_by", "created_at"]

    def validate_file(self, value):
        allowed = {".pdf", ".docx", ".txt", ".md"}
        extension = os.path.splitext(value.name)[1].casefold()
        if extension not in allowed:
            raise serializers.ValidationError("Upload a PDF, DOCX, TXT, or Markdown file.")
        if value.size > 20 * 1024 * 1024:
            raise serializers.ValidationError("Files must be 20 MB or smaller.")
        return value

    def create(self, validated_data):
        validated_data.pop("project", None)
        upload = validated_data.pop("file")
        digest = hashlib.sha256()
        content = bytearray()
        for chunk in upload.chunks():
            digest.update(chunk)
            if len(content) <= 1_000_000:
                content.extend(chunk)
        ext = os.path.splitext(upload.name)[1].casefold()
        extracted = ""
        state = SourceDocument.Status.UPLOADED
        error = ""
        if ext in {".txt", ".md"}:
            try:
                extracted = bytes(content).decode("utf-8-sig")
                if len(extracted.encode("utf-8")) > 1_000_000:
                    raise ValueError("Extracted text exceeds 1 MB.")
                state = SourceDocument.Status.READY
            except (UnicodeDecodeError, ValueError) as exc:
                error = str(exc)[:500]
                state = SourceDocument.Status.FAILED
        return SourceDocument.objects.create(
            project=self.context["project"], filename=os.path.basename(upload.name.replace("\\", "/"))[:255], file=upload,
            media_type=getattr(upload, "content_type", "")[:120], byte_size=upload.size,
            sha256=digest.hexdigest(), extracted_text=extracted, extraction_status=state,
            extraction_error=error, created_by=self.context["request"].user,
        )


class DesignArtifactSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, allow_null=True)

    class Meta:
        model = DesignArtifact
        fields = ["id", "project", "kind", "title", "version", "content", "source_evidence", "created_by", "created_by_username", "created_at", "updated_at"]
        read_only_fields = ["id", "project", "version", "created_by", "created_by_username", "created_at", "updated_at"]


class BusinessAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessAnalysis
        fields = ["id", "project", "version", "problem", "proposed_solution", "expected_value", "success_metrics", "constraints", "risks", "assumptions", "status", "evidence", "created_by", "created_at", "updated_at"]
        read_only_fields = ["id", "project", "version", "status", "created_by", "created_at", "updated_at"]


class BusinessObjectiveSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessObjective
        fields = ["id", "project", "title", "description", "success_metric", "source_evidence", "created_at", "updated_at"]
        read_only_fields = ["id", "project", "created_at", "updated_at"]


class StakeholderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stakeholder
        fields = ["id", "project", "name", "role", "organization", "needs", "evidence", "created_at", "updated_at"]
        read_only_fields = ["id", "project", "created_at", "updated_at"]


class PersonaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Persona
        fields = ["id", "project", "name", "role", "goals", "needs", "pain_points", "expectations", "evidence", "validation_state", "created_at", "updated_at"]
        read_only_fields = ["id", "project", "validation_state", "created_at", "updated_at"]


class TestSuiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestSuite
        fields = ["id", "project", "name", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "project", "created_at", "updated_at"]


class TestCaseSerializer(ProjectBoundSerializer):
    class Meta:
        model = TestCase
        fields = ["id", "project", "suite", "requirement", "code", "title", "preconditions", "steps", "expected_result", "priority", "test_type", "status", "generated_by_ai", "created_by", "created_at", "updated_at"]
        read_only_fields = ["id", "project", "generated_by_ai", "created_by", "created_at", "updated_at"]


class TestExecutionSerializer(serializers.ModelSerializer):
    executed_by_username = serializers.CharField(source="executed_by.username", read_only=True, allow_null=True)

    class Meta:
        model = TestExecution
        fields = ["id", "test_case", "result", "actual_result", "evidence", "executed_by", "executed_by_username", "executed_at"]
        read_only_fields = ["id", "executed_by", "executed_by_username", "executed_at"]

    def validate_test_case(self, value):
        project = self.context.get("project")
        if value.project_id != project.pk:
            raise serializers.ValidationError("Test case must belong to this project.")
        return value


class RelationshipSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArtefactRelationship
        fields = ["id", "project", "source_type", "source_id", "target_type", "target_id", "relationship_type", "origin", "confidence", "status", "evidence", "created_by", "created_at"]
        read_only_fields = ["id", "project", "origin", "status", "created_by", "created_at"]


class ApprovalSerializer(serializers.ModelSerializer):
    requested_by_username = serializers.CharField(source="requested_by.username", read_only=True, allow_null=True)
    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True, allow_null=True)

    class Meta:
        model = Approval
        fields = ["id", "project", "artefact_type", "artefact_id", "artefact_version", "decision", "comment", "requested_by", "requested_by_username", "reviewer", "reviewer_username", "requested_at", "reviewed_at"]
        read_only_fields = ["id", "project", "decision", "requested_by", "requested_by_username", "reviewer", "reviewer_username", "requested_at", "reviewed_at"]


class ApprovalDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=[Approval.Decision.APPROVED, Approval.Decision.REJECTED, Approval.Decision.CHANGES_REQUESTED])
    comment = serializers.CharField(max_length=4000, required=False, allow_blank=True)
