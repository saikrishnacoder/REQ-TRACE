from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from tempfile import TemporaryDirectory
from rest_framework.test import APITestCase
from unittest.mock import patch

from config.settings import database_config
from config.middleware import ApiErrorMiddleware
from projects.models import Project, Workspace
from projects.models import WorkspaceMembership


class FoundationConfigurationTests(TestCase):
    def test_mysql_url_is_parsed_for_django_mysql_backend(self):
        config = database_config(
            "mysql://sf_user:p%40ssword@db.example.test:3307/specforge?charset=utf8mb4",
            debug=False,
        )
        self.assertEqual(config["ENGINE"], "django.db.backends.mysql")
        self.assertEqual(config["NAME"], "specforge")
        self.assertEqual(config["USER"], "sf_user")
        self.assertEqual(config["PASSWORD"], "p@ssword")
        self.assertEqual(config["HOST"], "db.example.test")
        self.assertEqual(config["PORT"], "3307")
        self.assertEqual(config["OPTIONS"]["charset"], "utf8mb4")

    def test_production_requires_explicit_mysql_database(self):
        with self.assertRaises(ImproperlyConfigured):
            database_config(None, debug=False)
        with self.assertRaises(ImproperlyConfigured):
            database_config("sqlite:///local.sqlite3", debug=False)

    def test_production_mysql_requires_a_trusted_tls_ca(self):
        with patch.dict("os.environ", {"DJANGO_ENV": "production"}, clear=True):
            with self.assertRaises(ImproperlyConfigured):
                database_config("mysql://user:password@db.example.test/specforge", debug=False)

    def test_all_requested_domain_apps_are_registered(self):
        names = {config.name for config in apps.get_app_configs()}
        self.assertTrue({
            "accounts", "projects", "documents", "requirements",
            "business_intelligence", "audience_intelligence", "ai_orchestration",
            "design", "testing", "traceability", "approvals",
        }.issubset(names))


class APIErrorMiddlewareTests(SimpleTestCase):
    def test_unhandled_api_errors_are_safe_json(self):
        request = RequestFactory().get("/api/v1/broken/")
        response = ApiErrorMiddleware(lambda _request: None).process_exception(request, RuntimeError("secret database details"))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(json.loads(response.content)["error"]["code"], "internal_error")
        self.assertNotIn("secret database details", response.content.decode())

    def test_html_api_not_found_is_converted_to_json(self):
        request = RequestFactory().get("/api/v1/unknown/")
        response = ApiErrorMiddleware(lambda _request: None).process_response(request, HttpResponse("debug details", status=404))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(json.loads(response.content)["error"]["code"], "not_found")


class HealthAndSchemaApiTests(APITestCase):
    def test_health_executes_a_real_database_query(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["service"], "specforge-web")
        self.assertEqual(response.data["database"], "sqlite")

    def test_development_frontend_origin_is_allowed_by_cors(self):
        response = self.client.get("/api/v1/health/", HTTP_ORIGIN="http://localhost:3000")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Access-Control-Allow-Origin"], "http://localhost:3000")

    def test_api_errors_use_the_standard_error_envelope(self):
        response = self.client.post("/api/v1/health/", {}, format="json")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.data["error"]["status"], 405)
        self.assertTrue(response.data["error"]["message"])

    def test_openapi_schema_is_available(self):
        response = self.client.get("/api/schema/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("/api/v1/health/", response.data["paths"])


class ProjectConstraintTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="owner", password="not-a-real-production-password")
        self.workspace = Workspace.objects.create(name="Workspace", key="workspace", owner=self.user)

    def test_project_key_is_unique_within_workspace(self):
        Project.objects.create(workspace=self.workspace, key="sample", name="First", owner=self.user)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Project.objects.create(workspace=self.workspace, key="sample", name="Duplicate", owner=self.user)


class ProjectAPIAccessTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="workspace-owner", email="owner@example.test", password="Not-used-password-123!")
        self.editor = User.objects.create_user(username="workspace-editor", email="editor@example.test", password="Not-used-password-123!")
        self.viewer = User.objects.create_user(username="workspace-viewer", email="viewer@example.test", password="Not-used-password-123!")
        self.outsider = User.objects.create_user(username="workspace-outsider", email="outsider@example.test", password="Not-used-password-123!")
        self.workspace = Workspace.objects.create(name="Shared", key="shared", owner=self.owner)
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.owner, role="Owner")
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.editor, role="Editor")
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.viewer, role="Viewer")

    def token_for(self, username, password="Not-used-password-123!"):
        response = self.client.post(
            "/api/v1/auth/login/", {"username": username, "password": password}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["token"]

    def test_workspace_member_can_create_project_and_outsider_cannot_see_it(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_for(self.editor.username)}")
        created = self.client.post(
            "/api/v1/projects/",
            {"workspace": str(self.workspace.pk), "key": "alpha", "name": "Alpha"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        project_id = created.data["id"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_for(self.outsider.username)}")
        self.assertEqual(self.client.get("/api/v1/projects/").data, [])
        self.assertEqual(self.client.get(f"/api/v1/projects/{project_id}/").status_code, 404)

    def test_viewer_cannot_create_project_and_owner_can_delete(self):
        payload = {"workspace": str(self.workspace.pk), "key": "read-only", "name": "Read only"}
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_for(self.viewer.username)}")
        self.assertEqual(self.client.post("/api/v1/projects/", payload, format="json").status_code, 403)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_for(self.owner.username)}")
        created = self.client.post("/api/v1/projects/", payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(self.client.delete(f"/api/v1/projects/{created.data['id']}/").status_code, 204)

    def test_project_update_archive_restore_duplicate_and_activity_are_attributed(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_for(self.owner.username)}")
        created = self.client.post(
            "/api/v1/projects/",
            {"workspace": str(self.workspace.pk), "key": "lifecycle", "name": "Lifecycle"},
            format="json",
        )
        project_id = created.data["id"]
        updated = self.client.patch(f"/api/v1/projects/{project_id}/", {"description": "Edited"}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["description"], "Edited")

        archived = self.client.post(f"/api/v1/projects/{project_id}/archive/")
        self.assertEqual(archived.status_code, 200, archived.data)
        self.assertEqual(archived.data["status"], "Archived")
        restored = self.client.post(f"/api/v1/projects/{project_id}/restore/")
        self.assertEqual(restored.status_code, 200, restored.data)
        duplicate = self.client.post(f"/api/v1/projects/{project_id}/duplicate/")
        self.assertEqual(duplicate.status_code, 201, duplicate.data)
        self.assertEqual(duplicate.data["key"], "lifecycle-copy")

        events = self.client.get(f"/api/v1/projects/{project_id}/activity/")
        self.assertEqual(events.status_code, 200)
        actions = {event["action"] for event in events.data}
        self.assertTrue({"project.created", "project.updated", "project.archived", "project.restored", "project.duplicated"}.issubset(actions))
        self.assertTrue(all(event["actor_username"] == self.owner.username for event in events.data))

    def test_workspace_owner_can_add_update_and_remove_members(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token_for(self.owner.username)}")
        url = f"/api/v1/workspaces/{self.workspace.pk}/members/"
        added = self.client.post(url, {"email": self.outsider.email, "role": "Viewer"}, format="json")
        self.assertEqual(added.status_code, 201, added.data)
        self.assertEqual(added.data["username"], self.outsider.username)
        changed = self.client.post(url, {"email": self.outsider.email, "role": "Editor"}, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertIn(self.outsider.username, {item["username"] for item in self.client.get(url).data})
        removed = self.client.delete(f"{url}{self.outsider.pk}/")
        self.assertEqual(removed.status_code, 204)
        self.assertNotIn(self.outsider.username, {item["username"] for item in self.client.get(url).data})


class EngineeringAPITests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(username="eng-owner", email="eng-owner@example.test", password="Strong-Engineering-123!")
        self.editor = User.objects.create_user(username="eng-editor", email="eng-editor@example.test", password="Strong-Engineering-123!")
        self.viewer = User.objects.create_user(username="eng-viewer", email="eng-viewer@example.test", password="Strong-Engineering-123!")
        self.outsider = User.objects.create_user(username="eng-outsider", email="eng-outsider@example.test", password="Strong-Engineering-123!")
        self.workspace = Workspace.objects.create(name="Engineering", key="engineering", owner=self.owner)
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.owner, role="Owner")
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.editor, role="Editor")
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.viewer, role="Viewer")
        self.project = Project.objects.create(workspace=self.workspace, key="api", name="API Project", owner=self.owner)
        self.other_project = Project.objects.create(workspace=self.workspace, key="other", name="Other Project", owner=self.owner)
        self.media = TemporaryDirectory()
        self.override_media = override_settings(MEDIA_ROOT=self.media.name)
        self.override_media.enable()
        self.addCleanup(self.override_media.disable)
        self.addCleanup(self.media.cleanup)

    def authenticate(self, user):
        from accounts.views import issue_session
        token, _ = issue_session(user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_requirement_crud_versions_approval_search_pagination_and_workspace_roles(self):
        self.authenticate(self.editor)
        base = f"/api/v1/projects/{self.project.pk}/requirements/"
        created = self.client.post(base, {
            "code": "REQ-1", "title": "Create account", "statement": "A visitor can create an account.",
            "category": "Functional", "acceptance_criteria": ["Account is persisted"],
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        requirement_id = created.data["id"]
        self.assertEqual(created.data["current_version"], 1)
        self.assertEqual(self.client.get(base + "?search=account&page_size=1").data["count"], 1)
        self.assertEqual(self.client.get(base + "?category=Security").data["count"], 0)
        cross_project = self.client.get(f"/api/v1/projects/{self.other_project.pk}/requirements/{requirement_id}/")
        self.assertEqual(cross_project.status_code, 404)

        updated = self.client.patch(f"{base}{requirement_id}/", {"statement": "A user can register."}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["current_version"], 2)
        versions = self.client.get(f"{base}{requirement_id}/versions/")
        self.assertEqual([row["version"] for row in versions.data], [2, 1])
        self.assertEqual(versions.data[0]["snapshot"]["statement"], "A user can register.")

        requested = self.client.post(f"{base}{requirement_id}/submit-review/", {"comment": "Ready"}, format="json")
        self.assertEqual(requested.status_code, 201, requested.data)
        approval_id = requested.data["id"]
        self.authenticate(self.viewer)
        denied = self.client.post(f"/api/v1/projects/{self.project.pk}/approvals/{approval_id}/decision/", {"decision": "Approved"}, format="json")
        self.assertEqual(denied.status_code, 403)
        self.authenticate(self.owner)
        approved = self.client.post(f"/api/v1/projects/{self.project.pk}/approvals/{approval_id}/decision/", {"decision": "Approved", "comment": "Accepted"}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        current = self.client.get(f"{base}{requirement_id}/")
        self.assertEqual(current.data["status"], "Approved")
        self.assertEqual(current.data["approval_state"], "Approved")

    def test_text_document_upload_design_versions_and_approval(self):
        self.authenticate(self.editor)
        document_url = f"/api/v1/projects/{self.project.pk}/documents/"
        upload = SimpleUploadedFile("scope.md", b"# Scope\nThe system supports accounts.", content_type="text/markdown")
        document = self.client.post(document_url, {"file": upload}, format="multipart")
        self.assertEqual(document.status_code, 201, document.data)
        self.assertEqual(document.data["extraction_status"], "Ready")
        self.assertIn("supports accounts", document.data["extracted_text"])
        self.assertEqual(len(document.data["sha256"]), 64)
        download = self.client.get(f"{document_url}{document.data['id']}/download/")
        self.assertEqual(download.status_code, 200)
        self.assertIn("attachment", download["Content-Disposition"])
        self.assertIn(b"supports accounts", b"".join(download.streaming_content))
        invalid_upload = SimpleUploadedFile("payload.py", b"print('no')", content_type="text/plain")
        invalid = self.client.post(document_url, {"file": invalid_upload}, format="multipart")
        self.assertEqual(invalid.status_code, 400)

        design_url = f"/api/v1/projects/{self.project.pk}/design-artifacts/"
        design = self.client.post(design_url, {"kind": "Architecture", "title": "System", "content": {"backend": "Django REST Framework"}}, format="json")
        self.assertEqual(design.status_code, 201, design.data)
        newer = self.client.patch(f"{design_url}{design.data['id']}/", {"content": {"backend": "DRF"}}, format="json")
        self.assertEqual(newer.status_code, 201, newer.data)
        self.assertEqual(newer.data["version"], 2)
        self.assertNotEqual(newer.data["id"], design.data["id"])

        approval_url = f"/api/v1/projects/{self.project.pk}/approvals/"
        requested = self.client.post(approval_url, {"artefact_type": "SourceDocument", "artefact_id": document.data["id"], "artefact_version": 1}, format="json")
        self.assertEqual(requested.status_code, 201, requested.data)
        self.authenticate(self.owner)
        approved = self.client.post(f"{approval_url}{requested.data['id']}/decision/", {"decision": "Approved"}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        readiness = self.client.get(f"/api/v1/projects/{self.project.pk}/generation/readiness/")
        self.assertEqual(readiness.data["approved_srs_count"], 1)

    def test_testing_traceability_business_and_audience_endpoints_are_persistent_and_scoped(self):
        self.authenticate(self.editor)
        root = f"/api/v1/projects/{self.project.pk}/"
        suite = self.client.post(root + "test-suites/", {"name": "Smoke"}, format="json")
        self.assertEqual(suite.status_code, 201, suite.data)
        case = self.client.post(root + "test-cases/", {
            "code": "TC-1", "title": "Registration works", "suite": suite.data["id"],
            "expected_result": "Account is created", "steps": ["Submit registration form"],
        }, format="json")
        self.assertEqual(case.status_code, 201, case.data)
        execution = self.client.post(root + "test-executions/", {"test_case": case.data["id"], "result": "Passed", "actual_result": "Account created"}, format="json")
        self.assertEqual(execution.status_code, 201, execution.data)
        self.assertEqual(self.client.get(root + "test-executions/").data["results"][0]["executed_by"], self.editor.pk)

        link = self.client.post(root + "traceability-links/", {
            "source_type": "TestCase", "source_id": case.data["id"], "target_type": "TestSuite",
            "target_id": suite.data["id"], "relationship_type": "part_of",
        }, format="json")
        self.assertEqual(link.status_code, 201, link.data)
        self.assertEqual(link.data["status"], "Proposed")
        self.authenticate(self.owner)
        confirmed = self.client.post(root + f"traceability-links/{link.data['id']}/confirm/", {}, format="json")
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(confirmed.data["status"], "Confirmed")

        analysis = self.client.post(root + "business-analyses/", {"problem": "Manual workflow is slow."}, format="json")
        self.assertEqual(analysis.status_code, 201, analysis.data)
        objective = self.client.post(root + "business-objectives/", {"title": "Reduce handling time"}, format="json")
        self.assertEqual(objective.status_code, 201, objective.data)
        persona = self.client.post(root + "personas/", {"name": "Analyst", "role": "Operations", "goals": ["Resolve cases"]}, format="json")
        self.assertEqual(persona.status_code, 201, persona.data)
        validated = self.client.post(root + f"personas/{persona.data['id']}/validate/", {}, format="json")
        self.assertEqual(validated.status_code, 200, validated.data)
        self.assertEqual(validated.data["validation_state"], "Validated")
import json

