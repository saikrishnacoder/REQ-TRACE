import io
import json
import zipfile

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from unittest.mock import patch

from accounts.views import issue_session
from approvals.models import Approval
from application_generation.models import GenerationPlan
from application_generation.models import GeneratedFile, GenerationRun
from application_generation.provider import GeneratedCodeSet, ProviderGenerationError, generate_files
from application_generation.services import process_next_generation_run
from design.models import DesignArtifact
from documents.models import SourceDocument
from projects.models import Project, Workspace, WorkspaceMembership
from requirements.models import Requirement


class GenerationPlanAPITests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(username="generation-owner", password="unused-Generation-123!")
        self.editor = user_model.objects.create_user(username="generation-editor", password="unused-Generation-123!")
        self.viewer = user_model.objects.create_user(username="generation-viewer", password="unused-Generation-123!")
        self.workspace = Workspace.objects.create(name="Generator", key="generator", owner=self.owner)
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.owner, role=WorkspaceMembership.Role.OWNER)
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.editor, role=WorkspaceMembership.Role.EDITOR)
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.viewer, role=WorkspaceMembership.Role.VIEWER)
        self.project = Project.objects.create(workspace=self.workspace, key="build", name="Build", owner=self.owner)

    def authenticate_as(self, user):
        raw_token, _ = issue_session(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_token}")

    def add_approved_inputs(self):
        requirement = Requirement.objects.create(
            project=self.project, code="REQ-1", title="Create account", statement="Users can create an account.",
            category=Requirement.Category.FUNCTIONAL, status=Requirement.Status.APPROVED,
            approval_state="Approved", acceptance_criteria=["A valid account is persisted."], created_by=self.owner,
        )
        Requirement.objects.create(
            project=self.project, code="REQ-2", title="Draft item", statement="This must not be included.",
            category=Requirement.Category.FUNCTIONAL, status=Requirement.Status.DRAFT,
            approval_state="Pending", created_by=self.owner,
        )
        kinds = [
            DesignArtifact.Kind.ARCHITECTURE,
            DesignArtifact.Kind.DATABASE,
            DesignArtifact.Kind.API,
            DesignArtifact.Kind.USER_FLOW,
            DesignArtifact.Kind.COMPONENT,
        ]
        for index, kind in enumerate(kinds):
            artifact = DesignArtifact.objects.create(
                project=self.project, kind=kind, title=f"Approved {kind}", version=1,
                content={
                    "confirmed": True,
                    "kind": kind,
                    "backend_modules": ["accounts", {"name": "inventory"}] if kind == DesignArtifact.Kind.ARCHITECTURE else [],
                }, created_by=self.owner,
            )
            Approval.objects.create(
                project=self.project, artefact_type="DesignArtifact", artefact_id=artifact.pk,
                artefact_version=artifact.version, decision=Approval.Decision.APPROVED,
                requested_by=self.owner, reviewer=self.owner,
            )
        srs = SourceDocument.objects.create(
            project=self.project, filename="approved-srs.md", extraction_status=SourceDocument.Status.READY,
            extracted_text="Confirmed product scope and acceptance guidance.", sha256="a" * 64,
        )
        Approval.objects.create(
            project=self.project, artefact_type="SourceDocument", artefact_id=srs.pk,
            artefact_version=1, decision=Approval.Decision.APPROVED,
            requested_by=self.owner, reviewer=self.owner,
        )
        return requirement

    def resolve_blueprint_questions(self, plan_id):
        plan = GenerationPlan.objects.get(pk=plan_id)
        questions = [{**item, "status": "Resolved", "resolution": "Confirmed by the project owner for this test."} for item in plan.plan["clarification_questions"]]
        return self.client.patch(
            f"/api/v1/generation/plans/{plan_id}/",
            {"blueprint": {"clarification_questions": questions}}, format="json",
        )

    def test_missing_approved_inputs_block_plan_creation(self):
        self.authenticate_as(self.owner)
        readiness = self.client.get(f"/api/v1/projects/{self.project.pk}/generation/readiness/")
        self.assertEqual(readiness.status_code, 200)
        self.assertFalse(readiness.data["ready"])
        self.assertEqual(readiness.data["approved_requirement_count"], 0)

        response = self.client.post(f"/api/v1/projects/{self.project.pk}/generation/plans/", {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(GenerationPlan.objects.count(), 0)

    def test_plan_snapshots_only_approved_inputs_and_requires_owner_approval(self):
        requirement = self.add_approved_inputs()
        self.authenticate_as(self.editor)
        readiness = self.client.get(f"/api/v1/projects/{self.project.pk}/generation/readiness/")
        self.assertTrue(readiness.data["ready"])
        self.assertEqual(readiness.data["approved_requirement_count"], 1)

        created = self.client.post(f"/api/v1/projects/{self.project.pk}/generation/plans/", {}, format="json")
        self.assertEqual(created.status_code, 201, created.content.decode())
        self.assertEqual(created.data["state"], GenerationPlan.State.PENDING_REVIEW)
        self.assertEqual([item["code"] for item in created.data["source_snapshot"]["requirements"]], ["REQ-1"])
        self.assertEqual(created.data["source_snapshot"]["source_documents"][0]["filename"], "approved-srs.md")
        self.assertEqual(len(created.data["plan"]["requirement_traceability"]), 1)
        self.assertEqual(created.data["plan"]["requirement_traceability"][0]["requirement_id"], str(requirement.pk))
        self.assertIn("application_overview", created.data["plan"])
        self.assertIn("user_roles_permissions", created.data["plan"]["analysis"])
        self.assertIn("page_screen_inventory", created.data["plan"]["application_structure"])
        self.assertIn("database_entity_inventory", created.data["plan"]["application_structure"])
        self.assertTrue(created.data["plan"]["human_approval_required_before_scaffolding"])
        self.assertTrue(created.data["plan"]["clarification_questions"])
        plan_id = created.data["id"]

        denied = self.client.post(f"/api/v1/generation/plans/{plan_id}/approve/", {"comment": "Looks good"}, format="json")
        self.assertEqual(denied.status_code, 403)
        self.authenticate_as(self.owner)
        unresolved = self.client.post(f"/api/v1/generation/plans/{plan_id}/approve/", {}, format="json")
        self.assertEqual(unresolved.status_code, 409)
        self.assertTrue(unresolved.data["error"]["details"]["unresolved_topics"])
        self.assertEqual(self.resolve_blueprint_questions(plan_id).status_code, 200)

        approved = self.client.post(f"/api/v1/generation/plans/{plan_id}/approve/", {"comment": "Approved"}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data["state"], GenerationPlan.State.APPROVED)
        self.assertEqual(approved.data["reviewed_by_username"], self.owner.username)

    def test_blueprint_is_editable_but_source_traceability_is_server_managed(self):
        self.add_approved_inputs()
        self.authenticate_as(self.editor)
        created = self.client.post(f"/api/v1/projects/{self.project.pk}/generation/plans/", {}, format="json")
        self.assertEqual(created.status_code, 201, created.content.decode())
        plan_id = created.json()["id"]
        questions = [{**item, "status": "Resolved", "resolution": "Confirmed in test."} for item in GenerationPlan.objects.get(pk=plan_id).plan["clarification_questions"]]
        patch = self.client.patch(
            f"/api/v1/generation/plans/{plan_id}/",
            {"blueprint": {"application_overview": {"purpose": "Edited purpose"}, "clarification_questions": questions}}, format="json",
        )
        self.assertEqual(patch.status_code, 200, patch.data)
        self.assertEqual(patch.data["plan"]["application_overview"]["purpose"], "Edited purpose")
        self.assertEqual(len(patch.data["plan"]["requirement_traceability"]), 1)
        denied = self.client.patch(
            f"/api/v1/generation/plans/{plan_id}/",
            {"blueprint": {"requirement_traceability": []}}, format="json",
        )
        self.assertEqual(denied.status_code, 400)
        self.authenticate_as(self.owner)
        approved = self.client.post(f"/api/v1/generation/plans/{plan_id}/approve/", {}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        locked = self.client.patch(
            f"/api/v1/generation/plans/{plan_id}/",
            {"blueprint": {"application_overview": {"purpose": "Late edit"}}}, format="json",
        )
        self.assertEqual(locked.status_code, 409)

    def test_plan_cannot_be_approved_after_a_source_requirement_changes(self):
        requirement = self.add_approved_inputs()
        self.authenticate_as(self.owner)
        created = self.client.post(f"/api/v1/projects/{self.project.pk}/generation/plans/", {}, format="json")
        self.assertEqual(created.status_code, 201, created.content.decode())
        self.assertEqual(self.resolve_blueprint_questions(created.data["id"]).status_code, 200)
        requirement.statement = "Changed after plan review."
        requirement.save(update_fields=["statement", "updated_at"])
        response = self.client.post(f"/api/v1/generation/plans/{created.data['id']}/approve/", {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(GenerationPlan.objects.get(pk=created.data["id"]).state, GenerationPlan.State.PENDING_REVIEW)

    def test_viewer_cannot_create_a_generation_plan(self):
        self.add_approved_inputs()
        self.authenticate_as(self.viewer)
        response = self.client.post(f"/api/v1/projects/{self.project.pk}/generation/plans/", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_approved_blueprint_generates_safe_runnable_scaffold_archive(self):
        self.add_approved_inputs()
        self.authenticate_as(self.owner)
        draft = self.client.post(f"/api/v1/projects/{self.project.pk}/generation/plans/", {}, format="json")
        self.assertEqual(draft.status_code, 201, draft.data)
        plan_id = draft.data["id"]
        self.assertEqual(self.resolve_blueprint_questions(plan_id).status_code, 200)
        approved = self.client.post(f"/api/v1/generation/plans/{plan_id}/approve/", {}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)

        response = self.client.post(f"/api/v1/generation/plans/{plan_id}/scaffold/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.assertIn("no-store", response["Cache-Control"])
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            names = set(archive.namelist())
            self.assertIn("frontend/package.json", names)
            self.assertIn("frontend/src/pages/HomePage.tsx", names)
            self.assertIn("frontend/src/services/api.ts", names)
            self.assertIn("frontend/src/pages/ApprovedUserFlowPage.tsx", names)
            self.assertIn("backend/config/settings/development.py", names)
            self.assertIn("backend/config/settings/production.py", names)
            self.assertIn("backend/apps/core/views.py", names)
            self.assertIn("backend/apps/core/tests.py", names)
            self.assertIn("backend/apps/accounts/apps.py", names)
            self.assertIn("backend/apps/inventory/apps.py", names)
            self.assertIn("database/README.md", names)
            self.assertIn("docs/blueprint-traceability.json", names)
            self.assertFalse(any(name.startswith("/") or ".." in name.split("/") for name in names))
            package = json.loads(archive.read("frontend/package.json"))
            self.assertIn("react-router-dom", package["dependencies"])
            self.assertIn("@tanstack/react-query", package["dependencies"])
            self.assertIn("tailwindcss", package["devDependencies"])
            requirements = archive.read("backend/requirements.txt").decode()
            self.assertIn("Django", requirements)
            self.assertIn("djangorestframework", requirements)
            self.assertIn("mysqlclient", requirements)
            base_settings = archive.read("backend/config/settings/base.py").decode()
            production_settings = archive.read("backend/config/settings/production.py").decode()
            self.assertIn("rest_framework.permissions.IsAuthenticated", base_settings)
            self.assertIn("CSRF_TRUSTED_ORIGINS", production_settings)
            self.assertIn("DJANGO_CSRF_TRUSTED_ORIGINS", archive.read("backend/.env.example").decode())
            self.assertIn("apps.inventory.urls", archive.read("backend/config/urls.py").decode())
        self.assertTrue(self.project.activity_events.filter(action="application_generation.scaffold_downloaded", actor=self.owner).exists())

    def test_scaffold_requires_approved_current_blueprint_and_write_access(self):
        requirement = self.add_approved_inputs()
        self.authenticate_as(self.editor)
        draft = self.client.post(f"/api/v1/projects/{self.project.pk}/generation/plans/", {}, format="json")
        plan_id = draft.data["id"]
        pending = self.client.post(f"/api/v1/generation/plans/{plan_id}/scaffold/")
        self.assertEqual(pending.status_code, 409)

        self.authenticate_as(self.owner)
        self.assertEqual(self.resolve_blueprint_questions(plan_id).status_code, 200)
        self.assertEqual(self.client.post(f"/api/v1/generation/plans/{plan_id}/approve/", {}, format="json").status_code, 200)
        requirement.statement = "Updated after approval."
        requirement.save(update_fields=["statement", "updated_at"])
        stale = self.client.post(f"/api/v1/generation/plans/{plan_id}/scaffold/")
        self.assertEqual(stale.status_code, 409)

        self.authenticate_as(self.viewer)
        denied = self.client.post(f"/api/v1/generation/plans/{plan_id}/scaffold/")
        self.assertEqual(denied.status_code, 403)

    @patch("application_generation.views.provider_config", return_value=("private-test-key", "https://llm.invalid/v1", "test-model"))
    @patch("application_generation.services.generate_files")
    def test_generation_is_queued_then_reviewed_before_zip_download(self, mock_generate, _mock_config):
        requirement = self.add_approved_inputs()
        self.authenticate_as(self.owner)
        draft = self.client.post(f"/api/v1/projects/{self.project.pk}/generation/plans/", {}, format="json")
        self.assertEqual(draft.status_code, 201, draft.content.decode())
        plan_id = draft.json()["id"]
        self.assertEqual(self.resolve_blueprint_questions(plan_id).status_code, 200)
        approved = self.client.post(f"/api/v1/generation/plans/{plan_id}/approve/", {}, format="json")
        self.assertEqual(approved.status_code, 200, approved.content.decode())

        queued = self.client.post(
            f"/api/v1/generation/plans/{plan_id}/runs/",
            {"idempotency_key": "first-attempt"}, format="json",
        )
        self.assertEqual(queued.status_code, 202, queued.content.decode())
        run_id = queued.json()["id"]
        repeated = self.client.post(
            f"/api/v1/generation/plans/{plan_id}/runs/",
            {"idempotency_key": "first-attempt"}, format="json",
        )
        self.assertEqual(repeated.json()["id"], run_id)
        self.assertEqual(GenerationRun.objects.count(), 1)

        generated = GeneratedCodeSet.model_validate({"files": [{
            "path": "README.md", "content": "# Generated proposal", "requirement_ids": [str(requirement.pk)], "summary": "Project setup instructions",
        }]})
        mock_generate.return_value = (generated, "openai-compatible", "test-model")
        processed = process_next_generation_run()
        self.assertEqual(processed.state, GenerationRun.State.SUCCEEDED)
        generated_file = GeneratedFile.objects.get(run=processed)

        blocked_download = self.client.get(f"/api/v1/generation/runs/{run_id}/download/")
        self.assertEqual(blocked_download.status_code, 409)
        approved_file = self.client.post(
            f"/api/v1/generation/files/{generated_file.pk}/review/",
            {"decision": "Approved", "comment": "Reviewed"}, format="json",
        )
        self.assertEqual(approved_file.status_code, 200, approved_file.content.decode())
        self.assertEqual(approved_file.json()["reviewed_by_username"], self.owner.username)
        download = self.client.get(f"/api/v1/generation/runs/{run_id}/download/")
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "application/zip")

    def test_generated_source_schema_rejects_path_traversal_and_unapproved_requirement_refs(self):
        with self.assertRaises(ValueError):
            GeneratedCodeSet.model_validate({"files": [{"path": "../outside.py", "content": "bad", "requirement_ids": ["id"], "summary": "bad"}]})

        source = {"requirements": [{"id": "approved-id"}]}
        plan = {"purpose": "test"}
        response_body = {
            "choices": [{"message": {"content": '{"files":[{"path":"app.py","content":"x","requirement_ids":["other-id"],"summary":"x"}]}'}}]
        }
        with patch("application_generation.provider.provider_config", return_value=("secret", "https://llm.invalid/v1", "model")), patch("application_generation.provider.urlopen") as request:
            request.return_value.__enter__.return_value.read.return_value = __import__("json").dumps(response_body).encode()
            with self.assertRaises(ProviderGenerationError):
                generate_files(source, plan)
