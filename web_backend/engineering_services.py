from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from approvals.models import Approval
from business_intelligence.models import BusinessAnalysis
from design.models import DesignArtifact
from design.models import DesignArtifact
from design.models import DesignArtifact
from projects.models import ActivityLog
from requirements.models import Requirement, RequirementVersion


class ProjectAuditService:
    @staticmethod
    def record(project, actor, action, target_type, target_id, details=None):
        return ActivityLog.objects.create(
            workspace=project.workspace, project=project, actor=actor,
            action=action, target_type=target_type, target_id=str(target_id), details=details or {},
        )


class RequirementService:
    @staticmethod
    def snapshot(requirement):
        fields = ["code", "title", "description", "statement", "category", "priority", "status", "approval_state", "stakeholder", "acceptance_criteria", "dependencies", "source_page", "source_section"]
        return {field: getattr(requirement, field) for field in fields}

    @classmethod
    @transaction.atomic
    def record_initial_version(cls, requirement, actor):
        return RequirementVersion.objects.create(
            requirement=requirement, version=requirement.current_version,
            snapshot=cls.snapshot(requirement), change_reason="Initial version", created_by=actor,
        )

    @classmethod
    @transaction.atomic
    def record_update(cls, requirement, actor, reason=""):
        requirement.current_version += 1
        requirement.status = Requirement.Status.DRAFT
        requirement.approval_state = "Pending"
        requirement.save(update_fields=["current_version", "status", "approval_state", "updated_at"])
        Approval.objects.filter(
            project=requirement.project, artefact_type="Requirement", artefact_id=requirement.pk,
            decision=Approval.Decision.PENDING,
        ).update(decision=Approval.Decision.CHANGES_REQUESTED, reviewer=actor, reviewed_at=timezone.now())
        return RequirementVersion.objects.create(
            requirement=requirement, version=requirement.current_version,
            snapshot=cls.snapshot(requirement), change_reason=reason[:500], created_by=actor,
        )

    @classmethod
    @transaction.atomic
    def submit_for_review(cls, requirement, actor, comment=""):
        if requirement.status not in {Requirement.Status.DRAFT, Requirement.Status.REJECTED}:
            raise ValidationError("Only draft or rejected requirements can be submitted for review.")
        requirement.status = Requirement.Status.UNDER_REVIEW
        requirement.approval_state = "Pending"
        requirement.save(update_fields=["status", "approval_state", "updated_at"])
        return Approval.objects.create(
            project=requirement.project, artefact_type="Requirement", artefact_id=requirement.pk,
            artefact_version=requirement.current_version, decision=Approval.Decision.PENDING,
            comment=comment[:4000], requested_by=actor,
        )


class BusinessAnalysisService:
    @staticmethod
    def next_version(project, validated_data, actor):
        version = (BusinessAnalysis.objects.filter(project=project).order_by("-version").values_list("version", flat=True).first() or 0) + 1
        return BusinessAnalysis.objects.create(project=project, version=version, created_by=actor, **validated_data)


class DesignArtifactService:
    @staticmethod
    @transaction.atomic
    def create_version(previous, validated_data, actor):
        latest = DesignArtifact.objects.filter(project=previous.project, kind=previous.kind, title=previous.title).order_by("-version").first()
        version = (latest.version if latest else previous.version) + 1
        return DesignArtifact.objects.create(project=previous.project, version=version, created_by=actor, **validated_data)


class DesignArtifactService:
    @staticmethod
    @transaction.atomic
    def create_version(previous, validated_data, actor):
        latest = DesignArtifact.objects.filter(project=previous.project, kind=previous.kind, title=previous.title).order_by("-version").first()
        version = (latest.version if latest else previous.version) + 1
        return DesignArtifact.objects.create(project=previous.project, version=version, created_by=actor, **validated_data)


class DesignArtifactService:
    @staticmethod
    @transaction.atomic
    def create_version(previous, validated_data, actor):
        latest = DesignArtifact.objects.filter(project=previous.project, kind=previous.kind, title=previous.title).order_by("-version").first()
        version = (latest.version if latest else previous.version) + 1
        return DesignArtifact.objects.create(project=previous.project, version=version, created_by=actor, **validated_data)


class ApprovalService:
    @staticmethod
    @transaction.atomic
    def request(project, actor, artefact_type, artefact_id, version, comment=""):
        existing = Approval.objects.filter(
            project=project, artefact_type=artefact_type, artefact_id=artefact_id,
            artefact_version=version, decision=Approval.Decision.PENDING,
        ).first()
        if existing:
            return existing, False
        approval = Approval.objects.create(
            project=project, artefact_type=artefact_type, artefact_id=artefact_id,
            artefact_version=version, decision=Approval.Decision.PENDING,
            comment=comment[:4000], requested_by=actor,
        )
        if artefact_type == "Requirement":
            target = Requirement.objects.get(project=project, pk=artefact_id)
            target.status = Requirement.Status.UNDER_REVIEW
            target.approval_state = "Pending"
            target.save(update_fields=["status", "approval_state", "updated_at"])
        elif artefact_type == "BusinessAnalysis":
            target = BusinessAnalysis.objects.get(project=project, pk=artefact_id)
            target.status = BusinessAnalysis.Status.IN_REVIEW
            target.save(update_fields=["status", "updated_at"])
        ProjectAuditService.record(project, actor, "approval.requested", "approval", approval.pk, {
            "artefact_type": artefact_type, "artefact_id": str(artefact_id), "version": version,
        })
        return approval, True

    @staticmethod
    @transaction.atomic
    def decide(approval, actor, decision, comment=""):
        if approval.decision != Approval.Decision.PENDING:
            raise ValidationError("Only pending approval requests can be decided.")
        approval.decision = decision
        approval.comment = comment[:4000] or approval.comment
        approval.reviewer = actor
        approval.reviewed_at = timezone.now()
        approval.save(update_fields=["decision", "comment", "reviewer", "reviewed_at"])
        target = None
        if approval.artefact_type == "Requirement":
            target = Requirement.objects.filter(project=approval.project, pk=approval.artefact_id).first()
            if target:
                if decision == Approval.Decision.APPROVED:
                    target.status, target.approval_state = Requirement.Status.APPROVED, "Approved"
                elif decision == Approval.Decision.REJECTED:
                    target.status, target.approval_state = Requirement.Status.REJECTED, "Rejected"
                else:
                    target.status, target.approval_state = Requirement.Status.DRAFT, "Changes requested"
                target.save(update_fields=["status", "approval_state", "updated_at"])
        elif approval.artefact_type == "BusinessAnalysis":
            target = BusinessAnalysis.objects.filter(project=approval.project, pk=approval.artefact_id).first()
            if target:
                target.status = BusinessAnalysis.Status.APPROVED if decision == Approval.Decision.APPROVED else BusinessAnalysis.Status.REJECTED if decision == Approval.Decision.REJECTED else BusinessAnalysis.Status.IN_REVIEW
                target.save(update_fields=["status", "updated_at"])
        if approval.artefact_type in {"Requirement", "BusinessAnalysis", "DesignArtifact", "SourceDocument", "BusinessObjective"} and target is None and approval.artefact_type in {"Requirement", "BusinessAnalysis"}:
            raise ValidationError("The approved artefact no longer exists in this project.")
        ProjectAuditService.record(approval.project, actor, "approval.decided", "approval", approval.pk, {
            "decision": decision, "artefact_type": approval.artefact_type, "artefact_id": str(approval.artefact_id),
        })
        return approval
