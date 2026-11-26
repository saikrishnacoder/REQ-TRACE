import hashlib
import json

from django.db import transaction
from django.utils import timezone

from approvals.models import Approval
from audience_intelligence.models import Persona
from business_intelligence.models import BusinessAnalysis, BusinessObjective
from documents.models import SourceDocument
from design.models import DesignArtifact
from requirements.models import Requirement
from application_generation.models import GenerationPlan
from application_generation.models import GeneratedFile, GenerationRun
from application_generation.provider import generate_files


REQUIRED_DESIGN_KINDS = (
    DesignArtifact.Kind.ARCHITECTURE,
    DesignArtifact.Kind.DATABASE,
    DesignArtifact.Kind.API,
    DesignArtifact.Kind.USER_FLOW,
    DesignArtifact.Kind.COMPONENT,
)


def approved_designs(project):
    approved_versions = set(
        Approval.objects.filter(
            project=project,
            decision=Approval.Decision.APPROVED,
            artefact_type="DesignArtifact",
        ).values_list("artefact_id", "artefact_version")
    )
    artifacts = DesignArtifact.objects.filter(project=project).order_by("kind", "title", "version")
    return [item for item in artifacts if (item.pk, item.version) in approved_versions]


def approved_requirements(project):
    return Requirement.objects.filter(
        project=project,
        status=Requirement.Status.APPROVED,
        approval_state="Approved",
    ).select_related("source_document").order_by("code")


def approved_source_documents(project):
    approved_versions = set(Approval.objects.filter(
        project=project, decision=Approval.Decision.APPROVED, artefact_type="SourceDocument", artefact_version=1,
    ).values_list("artefact_id", flat=True))
    return SourceDocument.objects.filter(project=project, extraction_status=SourceDocument.Status.READY, pk__in=approved_versions).order_by("filename")


def approved_objectives(project):
    approved_ids = Approval.objects.filter(
        project=project, decision=Approval.Decision.APPROVED, artefact_type="BusinessObjective", artefact_version=1,
    ).values_list("artefact_id", flat=True)
    return BusinessObjective.objects.filter(project=project, pk__in=approved_ids).order_by("created_at")


def readiness(project):
    requirements = list(approved_requirements(project))
    designs = list(approved_designs(project))
    documents = list(approved_source_documents(project))
    approved_kinds = {item.kind for item in designs}
    return {
        "ready": bool(requirements) and not [kind for kind in REQUIRED_DESIGN_KINDS if kind not in approved_kinds],
        "approved_requirement_count": len(requirements),
        "approved_srs_count": len(documents),
        "missing_design_kinds": [kind for kind in REQUIRED_DESIGN_KINDS if kind not in approved_kinds],
        "approved_designs": [{"id": str(item.pk), "kind": item.kind, "title": item.title, "version": item.version} for item in designs],
    }


def build_source_snapshot(project):
    requirements = list(approved_requirements(project))
    designs = list(approved_designs(project))
    documents = list(approved_source_documents(project))
    current_readiness = readiness(project)
    if not current_readiness["ready"]:
        raise ValueError(current_readiness)

    snapshot = {
        "project": {"id": str(project.pk), "key": project.key, "name": project.name},
        "requirements": [
            {
                "id": str(item.pk), "code": item.code, "version": item.current_version,
                "title": item.title, "statement": item.statement, "description": item.description,
                "category": item.category, "priority": item.priority,
                "acceptance_criteria": item.acceptance_criteria,
                "dependencies": item.dependencies,
                "source": {
                    "document_id": str(item.source_document_id) if item.source_document_id else None,
                    "page": item.source_page, "section": item.source_section,
                },
            }
            for item in requirements
        ],
        "designs": [
            {"id": str(item.pk), "kind": item.kind, "title": item.title, "version": item.version,
             "content": item.content, "source_evidence": item.source_evidence}
            for item in designs
        ],
        "source_documents": [{"id": str(item.pk), "filename": item.filename, "version": 1, "sha256": item.sha256, "extracted_text": item.extracted_text[:200_000]} for item in documents],
        "business_analysis": [
            {"version": item.version, "problem": item.problem, "proposed_solution": item.proposed_solution,
             "expected_value": item.expected_value, "success_metrics": item.success_metrics,
             "constraints": item.constraints, "risks": item.risks, "assumptions": item.assumptions,
             "evidence": item.evidence}
            for item in BusinessAnalysis.objects.filter(project=project, status=BusinessAnalysis.Status.APPROVED).order_by("-version")[:1]
        ],
        "objectives": [{"id": str(item.pk), "title": item.title, "description": item.description, "success_metric": item.success_metric, "source_evidence": item.source_evidence} for item in approved_objectives(project)],
        "personas": [
            {"id": str(item.pk), "name": item.name, "role": item.role, "goals": item.goals, "needs": item.needs,
             "pain_points": item.pain_points, "expectations": item.expectations, "evidence": item.evidence}
            for item in Persona.objects.filter(project=project, validation_state=Persona.ValidationState.VALIDATED).order_by("name")
        ],
    }
    return snapshot


def draft_plan(snapshot):
    """Build an editable, evidence-linked application blueprint without inventing facts."""
    requirements = snapshot["requirements"]
    designs = snapshot["designs"]
    requirement_map = [
        {
            "requirement_id": item["id"],
            "requirement_code": item["code"],
            "title": item["title"],
            "category": item["category"],
            "acceptance_criteria": item["acceptance_criteria"],
            "source_document": item["source"],
        }
        for item in requirements
    ]
    by_category = {}
    for item in requirements:
        by_category.setdefault(item["category"], []).append({"id": item["id"], "code": item["code"], "title": item["title"], "statement": item["statement"], "acceptance_criteria": item["acceptance_criteria"]})
    architecture = next((item["content"] for item in designs if item["kind"] == DesignArtifact.Kind.ARCHITECTURE), {})
    database = next((item["content"] for item in designs if item["kind"] == DesignArtifact.Kind.DATABASE), {})
    api = next((item["content"] for item in designs if item["kind"] == DesignArtifact.Kind.API), {})
    flows = [item for item in designs if item["kind"] == DesignArtifact.Kind.USER_FLOW]
    components = [item for item in designs if item["kind"] == DesignArtifact.Kind.COMPONENT]
    business = snapshot.get("business_analysis", [])
    security_designs = [item for item in designs if item["kind"] == DesignArtifact.Kind.SECURITY]

    known = {
        "application_purpose": bool(business and business[0]["problem"]),
        "target_audience": bool(snapshot.get("personas")),
        "approved_srs": bool(snapshot.get("source_documents")),
        "business_rules": bool(by_category.get("Business") or (business and business[0]["constraints"])),
        "external_integrations": bool(api.get("integrations") or api.get("external_integrations")),
        "security_constraints": bool(security_designs or architecture.get("security")),
        "performance_requirements": bool(architecture.get("performance_requirements")),
    }
    clarification_text = {
        "application_purpose": "Confirm the application problem, intended outcome, and scope.",
        "target_audience": "Identify the target audience and validate user personas.",
        "approved_srs": "Attach and approve the SRS or confirm that approved requirements are the complete source of truth.",
        "business_rules": "Provide or confirm business rules and exception handling.",
        "external_integrations": "Confirm required external systems, authentication, and data exchange.",
        "security_constraints": "Specify security, privacy, retention, and access constraints.",
        "performance_requirements": "Provide measurable performance, availability, and scalability targets.",
    }
    clarification_questions = [{"topic": topic, "question": question, "status": "Needs clarification"} for topic, question in clarification_text.items() if not known[topic]]
    source_ids = [item["id"] for item in requirements]
    source_designs = [{"id": item["id"], "kind": item["kind"], "version": item["version"]} for item in designs]
    return {
        "blueprint_version": 1,
        "application_overview": {
            "project": snapshot["project"],
            "purpose": business[0]["problem"] if business else "",
            "proposed_solution": business[0]["proposed_solution"] if business else "",
            "expected_value": business[0]["expected_value"] if business else "",
            "objectives": snapshot.get("objectives", []),
            "approved_srs_sources": [{"id": item["id"], "filename": item["filename"], "sha256": item["sha256"]} for item in snapshot.get("source_documents", [])],
            "approved_srs_sources": [{"id": item["id"], "filename": item["filename"], "sha256": item["sha256"]} for item in snapshot.get("source_documents", [])],
        },
        "analysis": {
            "target_audience": snapshot.get("personas", []),
            "user_personas": snapshot.get("personas", []),
            "user_roles_permissions": [
                {"role": "Owner", "permissions": ["workspace and project administration", "approve blueprint", "approve generated changes"]},
                {"role": "Admin", "permissions": ["workspace administration", "approve blueprint", "approve generated changes"]},
                {"role": "Editor", "permissions": ["create and edit project planning", "draft and edit blueprint"]},
                {"role": "Viewer", "permissions": ["view project planning and blueprint"]},
            ],
            "main_features": [{"category": category, "requirements": entries} for category, entries in sorted(by_category.items())],
            "feature_breakdown": [{"category": category, "requirements": entries} for category, entries in sorted(by_category.items())],
            "feature_breakdown": [{"category": category, "requirements": entries} for category, entries in sorted(by_category.items())],
            "functional_requirements": by_category.get("Functional", []),
            "non_functional_requirements": by_category.get("Non-functional", []),
            "business_rules": by_category.get("Business", []) + (business[0]["constraints"] if business else []),
            "acceptance_criteria": [{"requirement_id": item["id"], "requirement_code": item["code"], "criteria": item["acceptance_criteria"]} for item in requirements if item["acceptance_criteria"]],
            "security_constraints": security_designs + (architecture.get("security", []) if isinstance(architecture.get("security", []), list) else []),
            "performance_requirements": architecture.get("performance_requirements", []),
            "external_integrations": api.get("integrations", api.get("external_integrations", [])),
        },
        "application_structure": {
            "page_screen_inventory": flows,
            "user_journeys": [{"design_id": item["id"], "title": item["title"], "version": item["version"], "journey": item["content"]} for item in flows],
            "user_journeys": [{"design_id": item["id"], "title": item["title"], "version": item["version"], "journey": item["content"]} for item in flows],
            "navigation_structure": [entry for flow in flows if isinstance(flow.get("content", {}).get("navigation", []), list) for entry in flow.get("content", {}).get("navigation", [])],
            "component_inventory": components,
            "backend_module_inventory": architecture.get("backend_modules", []),
            "database_entity_inventory": database.get("entities", database.get("tables", [])),
            "api_inventory": api.get("endpoints", api.get("operations", [])),
            "api_dependencies": api.get("dependencies", []),
            "development_dependency_map": [{"requirement_id": item["id"], "depends_on": item["dependencies"]} for item in requirements],
        },
        "approved_inputs": {"requirement_ids": source_ids, "designs": source_designs, "source_documents": [{"id": item["id"], "filename": item["filename"], "version": item["version"], "sha256": item["sha256"]} for item in snapshot.get("source_documents", [])], "business_analysis_versions": [item["version"] for item in business]},
        "source_hash": hashlib.sha256(canonical_json(snapshot).encode("utf-8")).hexdigest(),
        "implementation_sequence": [
            "Resolve clarification questions with project stakeholders.",
            "Review and edit the application blueprint against approved sources.",
            "Obtain an authorized human approval before project scaffolding.",
            "Scaffold only from the approved architecture and implement approved business rules.",
            "Implement approved database and API designs, then connect the specified screens.",
            "Create tests from approved acceptance criteria and trace every output to its source.",
        ],
        "approved_requirement_count": len(requirements),
        "requirement_traceability": requirement_map,
        "clarification_questions": clarification_questions,
        "missing_information": [item["topic"] for item in clarification_questions],
        "human_approval_required_before_scaffolding": True,
        "generated_content_notice": "This editable blueprint is a planning proposal. It contains only facts present in its approved source snapshot; unresolved areas are questions, not assumptions.",
    }


@transaction.atomic
def create_plan(project, actor):
    snapshot = build_source_snapshot(project)
    plan = draft_plan(snapshot)
    version = (GenerationPlan.objects.filter(project=project).order_by("-version").values_list("version", flat=True).first() or 0) + 1
    GenerationPlan.objects.filter(project=project, state=GenerationPlan.State.PENDING_REVIEW).update(state=GenerationPlan.State.SUPERSEDED)
    return GenerationPlan.objects.create(
        project=project,
        version=version,
        source_snapshot=snapshot,
        source_hash=plan["source_hash"],
        plan=plan,
        created_by=actor,
    )


@transaction.atomic
def review_plan(generation_plan, actor, decision, comment=""):
    generation_plan.state = decision
    generation_plan.reviewed_by = actor
    generation_plan.reviewed_at = timezone.now()
    generation_plan.review_comment = comment
    generation_plan.save(update_fields=["state", "reviewed_by", "reviewed_at", "review_comment"])
    return generation_plan


@transaction.atomic
def queue_generation_run(plan, actor, idempotency_key):
    if plan.state != GenerationPlan.State.APPROVED:
        raise ValueError("An approved generation plan is required.")
    current_snapshot = build_source_snapshot(plan.project)
    if canonical_json(current_snapshot) != canonical_json(plan.source_snapshot):
        raise ValueError("Approved project inputs changed after plan approval. Create and approve a new plan.")
    existing = GenerationRun.objects.filter(plan=plan, idempotency_key=idempotency_key).first()
    if existing:
        return existing
    return GenerationRun.objects.create(
        plan=plan,
        requested_by=actor,
        idempotency_key=idempotency_key,
        provider="openai-compatible",
        model="configured",
    )


def process_next_generation_run():
    with transaction.atomic():
        run = GenerationRun.objects.select_for_update(skip_locked=True).filter(
            state=GenerationRun.State.QUEUED
        ).select_related("plan").order_by("created_at").first()
        if run is None:
            return None
        run.state = GenerationRun.State.RUNNING
        run.started_at = timezone.now()
        run.save(update_fields=["state", "started_at"])

    try:
        generated, provider, model = generate_files(run.plan.source_snapshot, run.plan.plan)
        with transaction.atomic():
            for item in generated.files:
                GeneratedFile.objects.create(
                    run=run,
                    path=item.path,
                    content=item.content,
                    sha256=hashlib.sha256(item.content.encode("utf-8")).hexdigest(),
                    requirement_ids=item.requirement_ids,
                    summary=item.summary,
                )
            run.provider = provider
            run.model = model
            run.state = GenerationRun.State.SUCCEEDED
            run.finished_at = timezone.now()
            run.save(update_fields=["provider", "model", "state", "finished_at"])
    except Exception:
        # Provider exception text may include user data or configuration; keep
        # the persisted diagnostic generic and avoid leaking it to the client.
        with transaction.atomic():
            run.state = GenerationRun.State.FAILED
            run.error_message = "Application generation failed. Check the backend worker logs."
            run.finished_at = timezone.now()
            run.save(update_fields=["state", "error_message", "finished_at"])
    return run


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def unresolved_clarifications(plan):
    """Return questions without an explicit user resolution or out-of-scope reason."""
    unresolved = []
    for question in plan.get("clarification_questions", []):
        status = question.get("status")
        resolution = str(question.get("resolution", "")).strip()
        if status not in {"Resolved", "Not applicable"} or not resolution:
            unresolved.append(question.get("topic", "unspecified"))
    return unresolved
