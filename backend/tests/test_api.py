from collections.abc import Generator
import base64
import io
import zipfile

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app import main
from app import models  # noqa: F401 - register ORM models
from app.auth import hash_password
from app.config import settings
from app.models import Project


@pytest.fixture
def client(tmp_path) -> Generator[TestClient, None, None]:
    from app import rate_limit
    rate_limit._windows.clear()
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'api-test.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db(request: Request):
        session = test_session()
        identity = getattr(request.state, "user", None) if request is not None else None
        if identity:
            session.info["actor_user_id"] = identity.get("sub")
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    app.state.session_factory = test_session
    # Avoid entering the app lifespan so the suite never migrates the user's
    # configured database. Routes use only the isolated dependency override.
    yield TestClient(app)
    app.dependency_overrides.clear()
    rate_limit._windows.clear()
    app.state.session_factory = main.SessionLocal
    engine.dispose()


def test_project_and_requirement_review_flow_is_persisted(client: TestClient) -> None:
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "Payments", "key": "payments", "description": "Checkout"},
    )
    assert project_response.status_code == 201
    project = project_response.json()
    assert project["key"] == "PAYMENTS"


    requirement_response = client.post(
        f"/api/v1/projects/{project['id']}/requirements",
        json={
            "title": "Secure checkout",
            "statement": "The customer can pay securely.",
            "type": "Security",
            "priority": "High",
            "sourceType": "Manual",
            "sourceReference": "Manual entry",
            "originalText": "The customer can pay securely.",
        },
    )
    assert requirement_response.status_code == 201
    requirement = requirement_response.json()
    assert requirement["code"] == "PAYMENTS-001"
    assert requirement["status"] == "Draft"

    assert client.patch(
        f"/api/v1/requirements/{requirement['id']}",
        json={"status": "Under review"},
    ).status_code == 200
    assert client.patch(
        f"/api/v1/requirements/{requirement['id']}",
        json={"status": "Approved"},
    ).status_code == 200

    listed = client.get(f"/api/v1/projects/{project['id']}/requirements")
    assert listed.status_code == 200
    assert listed.json()[0]["status"] == "Approved"
    audit = client.get(f"/api/v1/projects/{project['id']}/audit")
    assert audit.status_code == 200
    assert {event["action"] for event in audit.json()} == {
        "requirement_approved",
        "requirement_submitted_for_review",
        "requirement_created",
        "project_created",
    }
    versions = client.get(f"/api/v1/requirements/{requirement['id']}/versions").json()
    assert [item["versionNumber"] for item in versions] == [3, 2, 1]
    assert [item["snapshot"]["status"] for item in versions] == ["Approved", "Under review", "Draft"]
    comment = client.post(f"/api/v1/requirements/{requirement['id']}/comments", json={"content": "Verify timeout behavior."})
    assert comment.status_code == 201
    assert client.get(f"/api/v1/requirements/{requirement['id']}/comments").json()[0]["content"] == "Verify timeout behavior."


def test_project_lifecycle_and_extended_requirement_bulk_workflow(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={
        "name": "Lifecycle", "key": "LIFE", "category": "Platform", "priority": "Critical",
        "objectives": "Ship a resilient service", "status": "Active",
    }).json()
    assert project["workspaceId"] == "default-workspace"
    assert project["category"] == "Platform"
    seed = client.post(f"/api/v1/projects/{project['id']}/requirements", json={
        "title": "Reusable requirement", "description": "Copy with project", "statement": "The system shall retain the baseline.",
        "type": "Business", "priority": "High", "tags": ["baseline"], "sourceType": "Manual",
        "sourceReference": "Project brief", "originalText": "Retain the baseline.",
    })
    assert seed.status_code == 201
    assert client.patch(f"/api/v1/projects/{project['id']}", json={"description": "Updated", "status": "On hold"}).json()["status"] == "On hold"
    archived = client.post(f"/api/v1/projects/{project['id']}/archive")
    assert archived.status_code == 200 and archived.json()["status"] == "Archived"
    duplicated = client.post(f"/api/v1/projects/{project['id']}/duplicate")
    assert duplicated.status_code == 201
    assert duplicated.json()["status"] == "Active"
    assert duplicated.json()["key"] != project["key"]
    copied_requirements = client.get(f"/api/v1/projects/{duplicated.json()['id']}/requirements").json()
    assert len(copied_requirements) == 1
    assert copied_requirements[0]["status"] == "Draft"
    assert copied_requirements[0]["title"] == "Reusable requirement"
    assert len(client.get(f"/api/v1/requirements/{copied_requirements[0]['id']}/versions").json()) == 1

    requirements = []
    for title in ("Data encryption", "Audit retention"):
        response = client.post(f"/api/v1/projects/{duplicated.json()['id']}/requirements", json={
            "title": title, "description": "Protection requirements", "statement": f"The system shall {title.lower()}.",
            "type": "Regulatory", "priority": "High", "verificationMethod": "Inspection",
            "tags": ["privacy", "release"], "sourceType": "Manual", "sourceReference": "Policy",
            "originalText": title,
        })
        assert response.status_code == 201, response.text
        requirements.append(response.json())
    assert requirements[0]["description"] == "Protection requirements"
    assert requirements[0]["verificationMethod"] == "Inspection"
    assert requirements[0]["currentVersion"] == 1
    ids = [item["id"] for item in requirements]
    assert client.patch(f"/api/v1/projects/{duplicated.json()['id']}/requirements/bulk", json={
        "requirementIds": ids, "priority": "Critical", "tags": ["security", "release"],
    }).status_code == 200
    for requirement_id in ids:
        saved = client.get(f"/api/v1/projects/{duplicated.json()['id']}/requirements").json()
        record = next(item for item in saved if item["id"] == requirement_id)
        assert record["priority"] == "Critical" and record["tags"] == ["security", "release"]
        assert record["currentVersion"] == 2
        assert len(client.get(f"/api/v1/requirements/{requirement_id}/versions").json()) == 2
    assert client.post(f"/api/v1/projects/{duplicated.json()['id']}/requirements/bulk-delete", json={"requirementIds": ids}).status_code == 204
    assert len(client.get(f"/api/v1/projects/{duplicated.json()['id']}/requirements").json()) == 1
    audit = client.get(f"/api/v1/projects/{duplicated.json()['id']}/audit").json()
    assert sum(event["action"] == "requirement_deleted" for event in audit) == 2
    assert client.delete(f"/api/v1/projects/{project['id']}").status_code == 204
    assert client.get("/api/v1/projects").json() == [duplicated.json()]


def test_cors_allows_local_frontend_and_rejects_unconfigured_origin(client: TestClient) -> None:
    allowed = client.options("/api/v1/health", headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET",
    })
    denied = client.options("/api/v1/health", headers={
        "Origin": "https://untrusted.example.test",
        "Access-Control-Request-Method": "GET",
    })
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert denied.headers.get("access-control-allow-origin") is None


def test_review_state_machine_rejects_skipping_review(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Web", "key": "WEB"}).json()
    requirement = client.post(
        f"/api/v1/projects/{project['id']}/requirements",
        json={
            "title": "Sign in",
            "statement": "A user can sign in.",
            "type": "Functional",
            "priority": "Medium",
            "sourceType": "Manual",
            "sourceReference": "Manual entry",
            "originalText": "A user can sign in.",
        },
    ).json()

    response = client.patch(
        f"/api/v1/requirements/{requirement['id']}",
        json={"status": "Approved"},
    )
    assert response.status_code == 409


def test_project_key_is_unique(client: TestClient) -> None:
    first = client.post("/api/v1/projects", json={"name": "First", "key": "APP"})
    second = client.post("/api/v1/projects", json={"name": "Second", "key": "APP"})
    assert first.status_code == 201
    assert second.status_code == 409


def test_project_create_list_and_detail_are_persisted_between_sessions(client: TestClient) -> None:
    response = client.post("/api/v1/projects", json={
        "name": "Requirements workspace",
        "key": "req-trace",
        "description": "Phase one persistence",
    })
    assert response.status_code == 201
    project = response.json()

    # Each API request opens a new database session. Read directly through a
    # fresh session too, so the assertion proves this is DB-backed persistence.
    with app.state.session_factory() as db:
        stored = db.get(Project, project["id"])
        assert stored is not None
        assert stored.name == "Requirements workspace"
        assert stored.key == "REQ-TRACE"
        assert stored.description == "Phase one persistence"

    listed = client.get("/api/v1/projects")
    assert listed.status_code == 200
    assert any(item["id"] == project["id"] for item in listed.json())

    detail = client.get(f"/api/v1/projects/{project['id']}")
    assert detail.status_code == 200
    assert detail.json() == project


def test_project_detail_returns_not_found_for_unknown_id(client: TestClient) -> None:
    response = client.get("/api/v1/projects/missing-project")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_health_reports_database_readiness(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "sqlite"
    assert response.json()["storage"] == "persistent"


def test_health_labels_vercel_sqlite_as_ephemeral(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(settings, "public_api_origin", "https://testserver")
    response = client.get("https://testserver/api/v1/health")
    assert response.status_code == 200
    assert response.json()["database"] == "sqlite"
    assert response.json()["storage"] == "ephemeral"


def test_public_deployment_rejects_an_unconfigured_host(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(settings, "public_api_origin", "https://api.reqtrace.example")
    response = client.get("https://other.example/api/v1/health")
    assert response.status_code == 421


def test_delete_removes_requirement_from_active_list_and_keeps_audit(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Archive", "key": "ARCH"}).json()
    requirement = client.post(
        f"/api/v1/projects/{project['id']}/requirements",
        json={
            "title": "Retained history",
            "statement": "The active list can hide an archived requirement.",
            "type": "Functional",
            "priority": "Low",
            "sourceType": "Manual",
            "sourceReference": "Manual entry",
            "originalText": "The active list can hide an archived requirement.",
        },
    ).json()

    deleted = client.delete(f"/api/v1/requirements/{requirement['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/projects/{project['id']}/requirements").json() == []
    audit = client.get(f"/api/v1/projects/{project['id']}/audit").json()
    assert any(event["action"] == "requirement_deleted" for event in audit)
    assert client.delete(f"/api/v1/requirements/{requirement['id']}").status_code == 404


def test_requirement_links_are_persisted_and_scoped_to_a_project(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Trace", "key": "TRACE"}).json()

    def create_requirement(title: str) -> dict:
        return client.post(
            f"/api/v1/projects/{project['id']}/requirements",
            json={
                "title": title,
                "statement": f"The system supports {title.lower()}.",
                "type": "Functional",
                "priority": "Medium",
                "sourceType": "Manual",
                "sourceReference": "Manual entry",
                "originalText": title,
            },
        ).json()

    source = create_requirement("Account access")
    target = create_requirement("Identity verification")
    link_response = client.post(
        f"/api/v1/requirements/{source['id']}/links",
        json={"targetRequirementId": target["id"], "relationshipType": "depends_on"},
    )
    assert link_response.status_code == 201
    assert link_response.json()["relationshipType"] == "depends_on"

    matrix = client.get(f"/api/v1/projects/{project['id']}/traceability").json()
    assert matrix["linkedPercent"] == 100
    assert matrix["orphanRequirementIds"] == []
    assert len(matrix["links"]) == 1

    duplicate = client.post(
        f"/api/v1/requirements/{source['id']}/links",
        json={"targetRequirementId": target["id"], "relationshipType": "depends_on"},
    )
    assert duplicate.status_code == 409
    assert client.delete(f"/api/v1/requirements/{source['id']}/links/{link_response.json()['id']}").status_code == 204
    assert len(client.get(f"/api/v1/projects/{project['id']}/traceability").json()["orphanRequirementIds"]) == 2


def test_test_cases_and_defects_are_persisted_and_audited(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "QA", "key": "QA"}).json()
    requirement = client.post(f"/api/v1/projects/{project['id']}/requirements", json={
        "title": "Sign in", "statement": "Users can sign in.", "type": "Functional", "priority": "High",
        "sourceType": "Manual", "sourceReference": "Manual", "originalText": "Users can sign in.",
    }).json()
    test_case = client.post(f"/api/v1/projects/{project['id']}/test-cases", json={
        "requirementId": requirement["id"], "title": "Valid sign in", "steps": ["Open form", "Submit valid credentials"],
        "expectedResult": "Dashboard is shown",
    })
    assert test_case.status_code == 201
    assert test_case.json()["code"] == "QA-TC-001"
    execution = client.post(f"/api/v1/test-cases/{test_case.json()['id']}/executions", json={
        "status": "Failed", "actualResult": "The dashboard did not appear after submission.",
    })
    assert execution.status_code == 201
    assert execution.json()["status"] == "Failed"
    assert client.get(f"/api/v1/projects/{project['id']}/test-executions").json()[0]["testCaseId"] == test_case.json()["id"]
    defect = client.post(f"/api/v1/projects/{project['id']}/defects", json={
        "requirementId": requirement["id"], "testCaseId": test_case.json()["id"],
        "title": "Submit button does nothing", "description": "The form remains unchanged.", "severity": "High",
    })
    assert defect.status_code == 201
    assert defect.json()["code"] == "QA-BUG-001"
    assert client.patch(f"/api/v1/defects/{defect.json()['id']}", json={"status": "Resolved"}).json()["status"] == "Resolved"
    assert len(client.get(f"/api/v1/projects/{project['id']}/test-cases").json()) == 1
    assert len(client.get(f"/api/v1/projects/{project['id']}/defects").json()) == 1
    matrix = client.get(f"/api/v1/projects/{project['id']}/traceability").json()
    assert matrix["testCoveredPercent"] == 100
    assert matrix["untestedRequirementIds"] == []
    assert matrix["failedTestCaseIds"] == [test_case.json()["id"]]
    assert matrix["testCases"][0]["id"] == test_case.json()["id"]
    assert matrix["defects"][0]["id"] == defect.json()["id"]
    actions = {item["action"] for item in client.get(f"/api/v1/projects/{project['id']}/audit").json()}
    assert {"test_case_created", "test_execution_recorded", "defect_created", "defect_status_changed"} <= actions


def test_test_case_rejects_cross_project_requirement(client: TestClient) -> None:
    first = client.post("/api/v1/projects", json={"name": "One", "key": "ONE"}).json()
    second = client.post("/api/v1/projects", json={"name": "Two", "key": "TWO"}).json()
    requirement = client.post(f"/api/v1/projects/{first['id']}/requirements", json={
        "title": "Feature", "statement": "Feature works.", "type": "Functional", "priority": "Low",
        "sourceType": "Manual", "sourceReference": "Manual", "originalText": "Feature works.",
    }).json()
    response = client.post(f"/api/v1/projects/{second['id']}/test-cases", json={
        "requirementId": requirement["id"], "title": "Cross scope", "steps": ["Check"], "expectedResult": "Pass",
    })
    assert response.status_code == 422


def test_requirement_analysis_uses_labeled_local_fallback_and_persists_history(client: TestClient, monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "ai_api_key", "")
    project = client.post("/api/v1/projects", json={"name": "Analysis", "key": "ANL"}).json()
    requirement = client.post(f"/api/v1/projects/{project['id']}/requirements", json={
        "title": "Fast dashboard", "statement": "The system loads a fast and easy dashboard.", "type": "Functional",
        "priority": "Medium", "sourceType": "Manual", "sourceReference": "Manual", "originalText": "Fast dashboard",
    }).json()
    response = client.post(f"/api/v1/requirements/{requirement['id']}/analyses")
    assert response.status_code == 201
    result = response.json()
    assert result["provider"] == "heuristic-fallback"
    assert result["result"]["isAiGenerated"] is False
    assert result["result"]["qualityScore"] <= 100
    assert result["result"]["issues"]
    history = client.get(f"/api/v1/requirements/{requirement['id']}/analyses")
    assert history.status_code == 200
    assert len(history.json()) == 1


def test_document_extraction_persists_source_and_links_requirements(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "ai_api_key", "")
    project = client.post("/api/v1/projects", json={"name": "Document intake", "key": "DOC"}).json()
    foreign_project = client.post("/api/v1/projects", json={"name": "Other", "key": "OTH"}).json()
    contents = b"The system shall retain each approved requirement for seven years.\nUsers must be able to export the audit history."
    extracted = client.post(f"/api/v1/projects/{project['id']}/documents/extract", json={
        "filename": "requirements.txt", "mediaType": "text/plain",
        "contentBase64": base64.b64encode(contents).decode("ascii"),
    })
    assert extracted.status_code == 201
    source = extracted.json()
    assert source["extractionMethod"] == "utf-8-text"
    assert len(source["candidateStatements"]) == 2
    assert source["extractedText"] == contents.decode()

    listed = client.get(f"/api/v1/projects/{project['id']}/documents")
    assert [item["id"] for item in listed.json()] == [source["id"]]
    requirement = client.post(f"/api/v1/projects/{project['id']}/requirements", json={
        "sourceDocumentId": source["id"], "title": "Retention", "statement": source["candidateStatements"][0],
        "type": "Functional", "priority": "High", "sourceType": "Document",
        "sourceReference": "requirements.txt · section 1", "originalText": source["candidateStatements"][0],
    })
    assert requirement.status_code == 201
    assert requirement.json()["sourceDocumentId"] == source["id"]

    requirement_id = requirement.json()["id"]
    for decision in ("Under review", "Approved"):
        response = client.patch(f"/api/v1/requirements/{requirement_id}", json={"status": decision})
        assert response.status_code == 200
    history = client.get(f"/api/v1/requirements/{requirement_id}/versions").json()
    assert [item["snapshot"]["status"] for item in history] == ["Approved", "Under review", "Draft"]
    assert all(item["snapshot"]["sourceDocumentId"] == source["id"] for item in history)

    analysis = client.post(f"/api/v1/requirements/{requirement_id}/analyses")
    assert analysis.status_code == 201
    assert analysis.json()["provider"] == "heuristic-fallback"
    assert len(client.get(f"/api/v1/requirements/{requirement_id}/analyses").json()) == 1

    cross_project = client.post(f"/api/v1/projects/{foreign_project['id']}/requirements", json={
        "sourceDocumentId": source["id"], "title": "Wrong scope", "statement": "A source cannot cross project boundaries.",
        "type": "Functional", "priority": "Medium", "sourceType": "Document",
        "sourceReference": "requirements.txt", "originalText": "Cross-project source reference",
    })
    assert cross_project.status_code == 422


def test_docx_extraction_rejects_invalid_document(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "DOCX", "key": "DOCX"}).json()
    document = io.BytesIO()
    with zipfile.ZipFile(document, "w") as archive:
        archive.writestr("word/document.xml", """<?xml version='1.0' encoding='UTF-8'?>
            <w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body>
            <w:p><w:r><w:t>The system shall validate every submitted transaction.</w:t></w:r></w:p>
            </w:body></w:document>""")
    valid = client.post(f"/api/v1/projects/{project['id']}/documents/extract", json={
        "filename": "requirements.docx", "contentBase64": base64.b64encode(document.getvalue()).decode("ascii"),
    })
    assert valid.status_code == 201
    assert valid.json()["extractionMethod"] == "docx-xml"
    assert valid.json()["candidateStatements"] == ["The system shall validate every submitted transaction."]

    invalid = client.post(f"/api/v1/projects/{project['id']}/documents/extract", json={
        "filename": "broken.docx", "contentBase64": base64.b64encode(b"not a zip").decode("ascii"),
    })
    assert invalid.status_code == 422


def test_pdf_extraction_returns_persistable_candidate_text(client: TestClient) -> None:
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    project = client.post("/api/v1/projects", json={"name": "PDF intake", "key": "PDF"}).json()
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 72 720 Td (The system shall retain each approved requirement for seven years.) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    pdf = io.BytesIO()
    writer.write(pdf)
    response = client.post(f"/api/v1/projects/{project['id']}/documents/extract", json={
        "filename": "requirements.pdf", "mediaType": "application/pdf",
        "contentBase64": base64.b64encode(pdf.getvalue()).decode("ascii"),
    })
    assert response.status_code == 201
    assert response.json()["extractionMethod"] == "pypdf"
    assert response.json()["candidateStatements"] == ["The system shall retain each approved requirement for seven years."]


def test_assistant_returns_grounded_records_and_persists_conversation(client: TestClient, monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "ai_api_key", "")
    project = client.post("/api/v1/projects", json={"name": "Assistant", "key": "AST"}).json()
    requirement = client.post(f"/api/v1/projects/{project['id']}/requirements", json={
        "title": "Card payment", "statement": "The buyer can pay with a valid card.", "type": "Functional",
        "priority": "High", "sourceType": "Manual", "sourceReference": "Manual", "originalText": "Card payment",
    }).json()
    response = client.post(f"/api/v1/projects/{project['id']}/assistant/messages", json={"message": "Summarize card payment"})
    assert response.status_code == 201
    reply = response.json()
    assert reply["assistantMessage"]["provider"] == "local-search-fallback"
    assert requirement["code"] in reply["assistantMessage"]["content"]
    assert reply["assistantMessage"]["sources"][0]["id"] == requirement["id"]
    conversation_id = reply["conversation"]["id"]
    assert len(client.get(f"/api/v1/conversations/{conversation_id}/messages").json()) == 2
    assert len(client.get(f"/api/v1/projects/{project['id']}/conversations").json()) == 1


def test_assistant_rejects_conversation_from_another_project(client: TestClient, monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "ai_api_key", "")
    first = client.post("/api/v1/projects", json={"name": "First", "key": "FST"}).json()
    second = client.post("/api/v1/projects", json={"name": "Second", "key": "SND"}).json()
    conversation = client.post(f"/api/v1/projects/{first['id']}/assistant/messages", json={"message": "hello"}).json()["conversation"]
    response = client.post(f"/api/v1/projects/{second['id']}/assistant/messages", json={
        "conversationId": conversation["id"], "message": "cross project access",
    })
    assert response.status_code == 404


def test_github_read_only_sync_imports_records_without_exposing_token(client: TestClient, monkeypatch) -> None:
    from app.config import settings
    import app.main as main

    monkeypatch.setattr(settings, "github_token", "server-secret")

    def fake_github_get(path: str):
        if path == "repos/acme/store":
            return {"full_name": "acme/store", "html_url": "https://github.com/acme/store", "default_branch": "main"}
        if path.endswith("/issues?state=all&per_page=100"):
            return [{"number": 17, "title": "Checkout timeout", "state": "open", "html_url": "https://github.com/acme/store/issues/17", "updated_at": "2026-11-17T10:00:00Z"}]
        if path.endswith("/pulls?state=all&per_page=100"):
            return [{"number": 18, "title": "Handle timeout", "state": "open", "html_url": "https://github.com/acme/store/pull/18", "updated_at": "2026-11-17T11:00:00Z"}]
        if path.endswith("/commits?per_page=100"):
            return []
        if path.endswith("/branches?per_page=100"):
            return [{"name": "main"}]
        raise AssertionError(path)

    monkeypatch.setattr(main, "github_api_get", fake_github_get)
    project = client.post("/api/v1/projects", json={"name": "Store", "key": "STORE"}).json()
    requirement = client.post(f"/api/v1/projects/{project['id']}/requirements", json={
        "title": "Checkout", "statement": "Checkout completes.", "type": "Functional", "priority": "High",
        "sourceType": "Manual", "sourceReference": "Manual", "originalText": "Checkout completes.",
    }).json()
    status_response = client.get("/api/v1/github/status").json()
    assert status_response["configured"] is True
    assert status_response["tokenExposed"] is False
    assert "server-secret" not in str(status_response)

    synced = client.post(f"/api/v1/projects/{project['id']}/github/repositories", json={"fullName": "acme/store"})
    assert synced.status_code == 200
    assert synced.json()["recordsImported"] == 3
    records = client.get(f"/api/v1/projects/{project['id']}/github/repositories").json()["records"]
    issue = next(item for item in records if item["recordType"] == "issue")
    assert next(item for item in records if item["recordType"] == "pull_request")
    linked = client.post(f"/api/v1/requirements/{requirement['id']}/github-links", json={"recordId": issue["id"]})
    assert linked.status_code == 201
    assert linked.json()["record"]["externalId"] == "17"
    assert any(item["action"] == "github_reference_linked" for item in client.get(f"/api/v1/projects/{project['id']}/audit").json())


def test_automation_read_only_rule_toggle_run_and_history(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Automation", "key": "AUTO"}).json()
    requirements = []
    for title in ("First item", "Second item"):
        requirements.append(client.post(f"/api/v1/projects/{project['id']}/requirements", json={
            "title": title, "statement": f"The app supports {title.lower()}.", "type": "Functional", "priority": "Low",
            "sourceType": "Manual", "sourceReference": "Manual", "originalText": title,
        }).json())
    rules = client.get(f"/api/v1/projects/{project['id']}/automation/rules").json()
    orphan_rule = next(item for item in rules if item["ruleKey"] == "orphan_requirements")
    assert client.post(f"/api/v1/projects/{project['id']}/automation/rules/orphan_requirements/run").status_code == 409
    enabled = client.put(f"/api/v1/projects/{project['id']}/automation/rules/orphan_requirements", json={"enabled": True})
    assert enabled.status_code == 200 and enabled.json()["enabled"] is True
    run = client.post(f"/api/v1/projects/{project['id']}/automation/rules/orphan_requirements/run")
    assert run.status_code == 201
    assert len(run.json()["findings"]) == 2
    assert client.get(f"/api/v1/projects/{project['id']}/automation/runs").json()[0]["ruleKey"] == "orphan_requirements"
    client.put(f"/api/v1/projects/{project['id']}/automation/rules/orphan_requirements", json={"enabled": False})
    assert client.post(f"/api/v1/projects/{project['id']}/automation/rules/orphan_requirements/run").status_code == 409


def test_ai_test_case_suggestions_are_reviewable_not_saved(client: TestClient, monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "ai_api_key", "")
    project = client.post("/api/v1/projects", json={"name": "Generation", "key": "GEN"}).json()
    requirement = client.post(f"/api/v1/projects/{project['id']}/requirements", json={
        "title": "Payment confirmation", "statement": "A buyer sees confirmation after payment.",
        "type": "Functional", "priority": "High", "acceptanceCriteria": ["The confirmation screen includes a receipt ID."],
        "sourceType": "Manual", "sourceReference": "Manual", "originalText": "Payment confirmation",
    }).json()
    response = client.post(f"/api/v1/requirements/{requirement['id']}/generate-test-cases")
    assert response.status_code == 200
    result = response.json()
    assert result["provider"] == "heuristic-fallback"
    assert result["savedAutomatically"] is False
    assert result["suggestions"][0]["expectedResult"] == "The confirmation screen includes a receipt ID."
    assert client.get(f"/api/v1/projects/{project['id']}/test-cases").json() == []


def test_authenticated_api_tokens_enforce_read_and_admin_roles(client: TestClient, monkeypatch) -> None:
    from app.auth import issue_token

    monkeypatch.setattr(settings, "auth_required", True)
    monkeypatch.setattr(settings, "auth_token_secret", "unit-test-secret-that-is-long-enough-for-hmac")
    session_generator = app.dependency_overrides[get_db](None)
    db = next(session_generator)
    db.add(models.UserAccount(id="viewer-user", email="viewer@example.test", password_hash=hash_password("test-password-123"), role="Viewer", active=True))
    db.add(models.UserAccount(id="admin-user", email="admin@example.test", password_hash=hash_password("admin-password-123"), role="Admin", active=True))
    db.commit()
    db.close()
    session_generator.close()
    login = client.post("/api/v1/auth/login", json={"email": " VIEWER@example.test ", "password": "test-password-123"})
    assert login.status_code == 200
    token = login.json()["accessToken"]
    assert client.get("/api/v1/projects").status_code == 401
    assert client.get("/api/v1/projects", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert client.post("/api/v1/projects", json={"name": "Blocked", "key": "BLOCKED"}, headers={"Authorization": f"Bearer {token}"}).status_code == 403

    admin_token = issue_token("admin-user", "admin@example.test", "Admin", settings.auth_token_secret, 5)
    created = client.post("/api/v1/projects", json={"name": "Secure", "key": "SECURE"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert created.status_code == 201
    private_requirement = client.post(f"/api/v1/projects/{created.json()['id']}/requirements", json={
        "title": "Private requirement", "statement": "This stays in its project.", "type": "Functional", "priority": "High",
        "sourceType": "Manual", "sourceReference": "Manual", "originalText": "Private requirement",
    }, headers={"Authorization": f"Bearer {admin_token}"}).json()
    private_test_case = client.post(f"/api/v1/projects/{created.json()['id']}/test-cases", json={
        "requirementId": private_requirement["id"], "title": "Private case", "steps": ["Run it"], "expectedResult": "It passes",
    }, headers={"Authorization": f"Bearer {admin_token}"}).json()
    private_defect = client.post(f"/api/v1/projects/{created.json()['id']}/defects", json={
        "requirementId": private_requirement["id"], "title": "Private issue", "description": "Only project members should see this.",
    }, headers={"Authorization": f"Bearer {admin_token}"}).json()
    private_conversation = client.post(f"/api/v1/projects/{created.json()['id']}/assistant/messages", json={"message": "Summarize this private project"}, headers={"Authorization": f"Bearer {admin_token}"}).json()["conversation"]
    assert client.delete(f"/api/v1/projects/{created.json()['id']}", headers={"Authorization": f"Bearer {token}"}).status_code == 403
    assert client.get("/api/v1/projects", headers={"Authorization": f"Bearer {token}"}).json() == []
    assert client.get("/api/v1/auth/users", headers={"Authorization": f"Bearer {token}"}).status_code == 403
    account = client.post("/api/v1/auth/users", json={"email": "editor@example.test", "password": "editor-password-123", "role": "Editor"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert account.status_code == 201
    assert "passwordHash" not in account.json()
    assert client.patch(f"/api/v1/auth/users/{account.json()['id']}", json={"role": None}, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 422
    editor_token = client.post("/api/v1/auth/login", json={"email": "editor@example.test", "password": "editor-password-123"}).json()["accessToken"]
    editor_headers = {"Authorization": f"Bearer {editor_token}"}
    viewer_headers = {"Authorization": f"Bearer {token}"}
    assert client.get(f"/api/v1/requirements/{private_requirement['id']}/versions", headers=editor_headers).status_code == 403
    assert client.post(f"/api/v1/projects/{created.json()['id']}/members", json={"userId": "viewer-user", "role": "Editor"}, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 422
    assert client.post(f"/api/v1/test-cases/{private_test_case['id']}/executions", json={"status": "Passed", "actualResult": "Pass"}, headers=editor_headers).status_code == 403
    assert client.patch(f"/api/v1/defects/{private_defect['id']}", json={"status": "Resolved"}, headers=editor_headers).status_code == 403
    assert client.get(f"/api/v1/conversations/{private_conversation['id']}/messages", headers=editor_headers).status_code == 403
    editor_project = client.post("/api/v1/projects", json={"name": "Editor Project", "key": "EDIT"}, headers=editor_headers)
    assert editor_project.status_code == 201
    editor_project_id = editor_project.json()["id"]
    assert client.post("/api/v1/projects", json={"id": created.json()["id"], "name": "Probe", "key": "PROBE"}, headers=editor_headers).status_code == 403
    editor_requirement = client.post(f"/api/v1/projects/{editor_project_id}/requirements", json={
        "title": "Editor requirement", "statement": "Visible to assigned members.", "type": "Functional", "priority": "Medium",
        "sourceType": "Manual", "sourceReference": "Manual", "originalText": "Editor requirement",
    }, headers=editor_headers).json()
    assert [item["id"] for item in client.get("/api/v1/projects", headers=editor_headers).json()] == [editor_project_id]
    assert client.get(f"/api/v1/projects/{editor_project_id}/requirements", headers=viewer_headers).status_code == 403
    assert client.post(f"/api/v1/projects/{editor_project_id}/members", json={"userId": "viewer-user", "role": "Viewer"}, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 422
    editor_workspace = client.get("/api/v1/workspaces", headers=editor_headers).json()[0]
    workspace_member = client.post(f"/api/v1/workspaces/{editor_workspace['id']}/members", json={"userId": "viewer-user", "role": "Viewer"}, headers=editor_headers)
    assert workspace_member.status_code == 201
    assigned = client.post(f"/api/v1/projects/{editor_project_id}/members", json={"userId": "viewer-user", "role": "Viewer"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert assigned.status_code == 201
    assert client.get(f"/api/v1/projects/{editor_project_id}/requirements", headers=viewer_headers).status_code == 200
    assert client.get(f"/api/v1/requirements/{editor_requirement['id']}/comments", headers=viewer_headers).status_code == 200
    assert client.post(f"/api/v1/requirements/{editor_requirement['id']}/comments", json={"content": "View only"}, headers=viewer_headers).status_code == 403
    assert client.post(f"/api/v1/projects/{editor_project_id}/requirements", json={}, headers=viewer_headers).status_code == 403
    assert client.delete(f"/api/v1/workspaces/{editor_workspace['id']}/members/viewer-user", headers=editor_headers).status_code == 204
    assert client.get(f"/api/v1/projects/{editor_project_id}/requirements", headers=viewer_headers).status_code == 403
    assert client.get(f"/api/v1/requirements/{editor_requirement['id']}/comments", headers=viewer_headers).status_code == 403
    member_actions = {event["action"] for event in client.get(f"/api/v1/projects/{editor_project_id}/audit", headers=editor_headers).json()}
    assert {"project_member_added", "project_member_removed"} <= member_actions
    demoted = client.patch(f"/api/v1/auth/users/{account.json()['id']}", json={"role": "Viewer"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert demoted.status_code == 200 and demoted.json()["role"] == "Viewer"
    assert client.get("/api/v1/auth/me", headers=editor_headers).status_code == 401
    assert client.post(f"/api/v1/projects/{editor_project_id}/requirements", json={}, headers=editor_headers).status_code == 401
    disabled = client.patch(f"/api/v1/auth/users/{account.json()['id']}", json={"active": False}, headers={"Authorization": f"Bearer {admin_token}"})
    assert disabled.status_code == 200 and disabled.json()["active"] is False
    assert client.get("/api/v1/auth/me", headers=editor_headers).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "editor@example.test", "password": "editor-password-123"}).status_code == 401
    admin_account = client.post("/api/v1/auth/users", json={"email": "second-admin@example.test", "password": "admin-password-123", "role": "Admin"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_account.status_code == 201
    second_admin_token = client.post("/api/v1/auth/login", json={"email": "second-admin@example.test", "password": "admin-password-123"}).json()["accessToken"]
    assert client.patch("/api/v1/auth/users/admin-user", json={"role": "Editor"}, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 200
    assert client.patch(f"/api/v1/auth/users/{admin_account.json()['id']}", json={"active": False}, headers={"Authorization": f"Bearer {second_admin_token}"}).status_code == 409
    from app import rate_limit
    rate_limit._windows.clear()
    for _ in range(10):
        assert client.post("/api/v1/auth/login", json={"email": "viewer@example.test", "password": "wrong-password"}).status_code == 401
    limited = client.post("/api/v1/auth/login", json={"email": "viewer@example.test", "password": "wrong-password"})
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0


def test_token_rejects_tampering_and_wrong_secret() -> None:
    from app.auth import decode_token, issue_token

    secret = "secret-value-long-enough-for-testing"
    token = issue_token("user", "u@example.test", "Viewer", secret, 5)
    body, signature = token.split(".")
    assert decode_token(f"{body}.x{signature}", secret) is None
    assert decode_token(token, "different-secret-value-for-testing") is None
    assert decode_token(issue_token("user", "u@example.test", "Viewer", secret, -1), secret) is None


def test_every_api_route_requires_auth_except_documented_public_routes(client: TestClient, monkeypatch) -> None:
    import re

    monkeypatch.setattr(settings, "auth_required", True)
    monkeypatch.setattr(settings, "auth_token_secret", "route-coverage-test-secret-long-enough")
    public_paths = {
        "/api/v1/health", "/api/v1/auth/login",
        "/api/v1/auth/password-reset-requests", "/api/v1/auth/password-resets",
    }
    checked = 0
    for route in app.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", None)
        if not path.startswith("/api/v1/") or not methods or path in public_paths:
            continue
        concrete = re.sub(r"\{[^{}]+\}", "route-audit-id", path)
        for method in methods - {"OPTIONS", "HEAD"}:
            response = client.request(method, concrete)
            assert response.status_code == 401, f"{method} {path} returned {response.status_code} without a token"
            checked += 1
    assert checked >= 30


def test_workspace_membership_is_a_hard_tenant_boundary(client: TestClient, monkeypatch) -> None:
    from app.auth import issue_token

    monkeypatch.setattr(settings, "auth_required", True)
    monkeypatch.setattr(settings, "auth_token_secret", "tenant-boundary-test-secret-long-enough")
    session_generator = app.dependency_overrides[get_db](None)
    db = next(session_generator)
    db.add(models.UserAccount(id="tenant-admin", email="tenant-admin@example.test", password_hash=hash_password("tenant-admin-password"), role="Admin", active=True))
    db.add(models.UserAccount(id="tenant-editor", email="tenant-editor@example.test", password_hash=hash_password("tenant-editor-password"), role="Editor", active=True))
    db.commit()
    db.close()
    session_generator.close()
    admin_headers = {"Authorization": f"Bearer {issue_token('tenant-admin', 'tenant-admin@example.test', 'Admin', settings.auth_token_secret, 30)}"}
    editor_headers = {"Authorization": f"Bearer {issue_token('tenant-editor', 'tenant-editor@example.test', 'Editor', settings.auth_token_secret, 30)}"}

    workspace_a = client.post("/api/v1/workspaces", json={"name": "Tenant A", "key": "TENANT-A"}, headers=admin_headers).json()
    workspace_b = client.post("/api/v1/workspaces", json={"name": "Tenant B", "key": "TENANT-B"}, headers=admin_headers).json()
    project = client.post("/api/v1/projects", json={"name": "Private A", "key": "PRIVATE-A", "workspaceId": workspace_a["id"]}, headers=admin_headers).json()
    outsider_member = client.post(f"/api/v1/projects/{project['id']}/members", json={"userId": "tenant-editor", "role": "Editor"}, headers=admin_headers)
    assert outsider_member.status_code == 422
    session_generator = app.dependency_overrides[get_db](None)
    db = next(session_generator)
    db.add(models.ProjectMembership(id="legacy-cross-tenant", project_id=project["id"], user_id="tenant-editor", role="Editor"))
    db.commit()
    db.close()
    session_generator.close()
    assert client.get(f"/api/v1/projects/{project['id']}", headers=editor_headers).status_code == 403
    assert client.get("/api/v1/projects", headers=editor_headers).json() == []

    assert client.post(f"/api/v1/workspaces/{workspace_b['id']}/members", json={"userId": "tenant-editor", "role": "Editor"}, headers=admin_headers).status_code == 201
    assert client.get(f"/api/v1/projects/{project['id']}", headers=editor_headers).status_code == 403
    assert client.get("/api/v1/projects", headers=editor_headers).json() == []

    assert client.post(f"/api/v1/workspaces/{workspace_a['id']}/members", json={"userId": "tenant-editor", "role": "Editor"}, headers=admin_headers).status_code == 201
    assert client.get(f"/api/v1/projects/{project['id']}", headers=editor_headers).status_code == 200
    assert [item["id"] for item in client.get("/api/v1/projects", headers=editor_headers).json()] == [project["id"]]
    assert client.delete(f"/api/v1/workspaces/{workspace_a['id']}/members/tenant-editor", headers=admin_headers).status_code == 204
    assert client.get(f"/api/v1/projects/{project['id']}", headers=editor_headers).status_code == 403
    session_generator = app.dependency_overrides[get_db](None)
    db = next(session_generator)
    assert db.scalar(select(models.ProjectMembership.id).where(
        models.ProjectMembership.project_id == project["id"], models.ProjectMembership.user_id == "tenant-editor",
    )) is None
    db.close()
    session_generator.close()


def test_password_recovery_is_single_use_and_revokes_sessions(client: TestClient, monkeypatch) -> None:
    from urllib.parse import parse_qs, urlsplit

    monkeypatch.setattr(settings, "auth_required", True)
    monkeypatch.setattr(settings, "auth_token_secret", "password-recovery-test-secret-long-enough")
    monkeypatch.setattr(settings, "public_app_origin", "https://reqtrace.example.test")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "smtp_from", "ReqTrace <noreply@example.test>")
    monkeypatch.setattr(settings, "smtp_starttls", True)
    monkeypatch.setattr(settings, "smtp_use_ssl", False)
    sent_links: list[str] = []
    monkeypatch.setattr(main, "send_password_reset_email", lambda recipient, url: sent_links.append(url))
    session_generator = app.dependency_overrides[get_db](None)
    db = next(session_generator)
    db.add(models.UserAccount(id="recovery-admin", email="recovery@example.test", password_hash=hash_password("initial-password-123"), role="Admin", active=True))
    db.commit()
    db.close()
    session_generator.close()

    original_login = client.post("/api/v1/auth/login", json={"email": "recovery@example.test", "password": "initial-password-123"})
    original_token = original_login.json()["accessToken"]
    assert original_login.status_code == 200
    project = client.post("/api/v1/projects", json={"name": "Attributed", "key": "ATTRIBUTED"}, headers={"Authorization": f"Bearer {original_token}"}).json()
    project_events = client.get(f"/api/v1/projects/{project['id']}/audit", headers={"Authorization": f"Bearer {original_token}"}).json()
    assert next(event for event in project_events if event["action"] == "project_created")["actorUserId"] == "recovery-admin"

    reset_request = client.post("/api/v1/auth/password-reset-requests", json={"email": "recovery@example.test"})
    unknown_request = client.post("/api/v1/auth/password-reset-requests", json={"email": "unknown@example.test"})
    assert reset_request.status_code == 202 and reset_request.json() == unknown_request.json()
    assert len(sent_links) == 1
    raw_token = parse_qs(urlsplit(sent_links[0]).query)["reset"][0]
    session_generator = app.dependency_overrides[get_db](None)
    db = next(session_generator)
    saved_token = db.scalar(select(models.PasswordResetToken).where(models.PasswordResetToken.user_id == "recovery-admin"))
    assert saved_token is not None and saved_token.token_digest != raw_token
    db.close()
    session_generator.close()

    reset = client.post("/api/v1/auth/password-resets", json={"token": raw_token, "newPassword": "updated-password-456"})
    assert reset.status_code == 204
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {original_token}"}).status_code == 401
    assert client.post("/api/v1/auth/password-resets", json={"token": raw_token, "newPassword": "another-password-789"}).status_code == 400
    new_login = client.post("/api/v1/auth/login", json={"email": "recovery@example.test", "password": "updated-password-456"})
    assert new_login.status_code == 200
    new_token = new_login.json()["accessToken"]
    security_events = client.get("/api/v1/auth/audit", headers={"Authorization": f"Bearer {new_token}"})
    assert security_events.status_code == 200
    assert {item["action"] for item in security_events.json()} >= {"password_reset_requested", "password_reset_completed"}

    changed = client.post("/api/v1/auth/change-password", json={
        "currentPassword": "updated-password-456", "newPassword": "final-password-789",
    }, headers={"Authorization": f"Bearer {new_token}"})
    assert changed.status_code == 204
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "recovery@example.test", "password": "updated-password-456"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "recovery@example.test", "password": "final-password-789"}).status_code == 200
def test_bootstrap_admin_is_only_created_once(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "auth_bootstrap_email", "admin@example.test")
    monkeypatch.setattr(settings, "auth_bootstrap_password", "initial-admin-password")
    session_generator = app.dependency_overrides[get_db](None)
    db = next(session_generator)
    monkeypatch.setattr(main, "SessionLocal", lambda: db)
    main.seed_initial_admin()
    first_hash = db.scalar(select(models.UserAccount.password_hash).where(models.UserAccount.email == "admin@example.test"))
    main.seed_initial_admin()
    second_hash = db.scalar(select(models.UserAccount.password_hash).where(models.UserAccount.email == "admin@example.test"))
    assert first_hash == second_hash
    assert db.scalar(select(models.UserAccount.role).where(models.UserAccount.email == "admin@example.test")) == "Admin"
    monkeypatch.setattr(settings, "api_host", "0.0.0.0")
    main.seed_initial_admin()  # existing account makes bootstrap credentials inert on serverless cold starts
    session_generator.close()


def test_desktop_local_token_guards_health_and_shutdown(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "local_api_token", "d" * 64)
    monkeypatch.setattr(app.state, "request_shutdown", None, raising=False)

    assert client.get("/api/v1/health").status_code == 401
    assert client.post("/api/v1/desktop/shutdown").status_code == 401

    headers = {"X-ReqTrace-Local-Token": "d" * 64}
    health = client.get("/api/v1/health", headers=headers)
    assert health.status_code == 200
    assert health.json()["local_auth"] is True
    assert health.headers["X-ReqTrace-Local-Auth"] == "enabled"
    assert client.post("/api/v1/desktop/shutdown", headers=headers).status_code == 503

    calls: list[str] = []
    monkeypatch.setattr(app.state, "request_shutdown", lambda: calls.append("shutdown"), raising=False)
    shutdown = client.post("/api/v1/desktop/shutdown", headers=headers)
    assert shutdown.status_code == 202
    assert shutdown.json() == {"status": "shutting_down"}
    assert calls == ["shutdown"]


def test_workspace_membership_isolation_and_role_permissions(client: TestClient, monkeypatch) -> None:
    from app.auth import issue_token

    monkeypatch.setattr(settings, "auth_required", True)
    monkeypatch.setattr(settings, "auth_token_secret", "workspace-test-secret-long-enough-for-hmac")
    session_generator = app.dependency_overrides[get_db](None)
    db = next(session_generator)
    db.add_all([
        models.UserAccount(id="workspace-owner", email="owner@workspace.test", password_hash=hash_password("owner-password-123"), role="Editor", active=True),
        models.UserAccount(id="workspace-viewer", email="viewer@workspace.test", password_hash=hash_password("viewer-password-123"), role="Editor", active=True),
        models.UserAccount(id="workspace-editor", email="editor@workspace.test", password_hash=hash_password("editor-password-123"), role="Editor", active=True),
    ])
    db.commit(); db.close(); session_generator.close()
    owner = {"Authorization": f"Bearer {issue_token('workspace-owner', 'owner@workspace.test', 'Editor', settings.auth_token_secret, 5)}"}
    viewer = {"Authorization": f"Bearer {issue_token('workspace-viewer', 'viewer@workspace.test', 'Editor', settings.auth_token_secret, 5)}"}
    editor = {"Authorization": f"Bearer {issue_token('workspace-editor', 'editor@workspace.test', 'Editor', settings.auth_token_secret, 5)}"}
    workspace = client.post("/api/v1/workspaces", json={"name": "Product", "key": "PRODUCT"}, headers=owner)
    assert workspace.status_code == 201
    project = client.post("/api/v1/projects", json={"name": "Portal", "key": "PORTAL", "workspaceId": workspace.json()["id"]}, headers=owner)
    assert project.status_code == 201
    assert client.post(f"/api/v1/workspaces/{workspace.json()['id']}/members", json={"userId": "workspace-editor", "role": "Editor"}, headers=owner).status_code == 201
    assert client.get("/api/v1/projects", headers=viewer).json() == []
    assert client.get(f"/api/v1/projects/{project.json()['id']}", headers=viewer).status_code == 403
    assert client.post(f"/api/v1/workspaces/{workspace.json()['id']}/members", json={"userId": "workspace-viewer", "role": "Viewer"}, headers=owner).status_code == 201
    assert len(client.get("/api/v1/projects", headers=viewer).json()) == 1
    assert client.patch(f"/api/v1/projects/{project.json()['id']}", json={"description": "No write access"}, headers=viewer).status_code == 403
    requirement = client.post(f"/api/v1/projects/{project.json()['id']}/requirements", json={
        "title": "Review gate", "statement": "The system shall require review.", "type": "Business",
        "priority": "Medium", "sourceType": "Manual", "sourceReference": "Policy", "originalText": "Review gate",
    }, headers=owner).json()
    assert client.patch(f"/api/v1/requirements/{requirement['id']}", json={"status": "Under review"}, headers=viewer).status_code == 403
    assert client.patch(f"/api/v1/requirements/{requirement['id']}", json={"status": "Under review"}, headers=owner).status_code == 200
    assert client.patch(f"/api/v1/requirements/{requirement['id']}", json={"status": "Approved"}, headers=viewer).status_code == 403
    assert client.patch(f"/api/v1/requirements/{requirement['id']}", json={"status": "Approved"}, headers=owner).status_code == 200
    assert client.post(f"/api/v1/projects/{project.json()['id']}/requirements/bulk-delete", json={"requirementIds": [requirement["id"]]}, headers=editor).status_code == 403
    assert client.post(f"/api/v1/projects/{project.json()['id']}/archive", headers=viewer).status_code == 403
    assert client.post(f"/api/v1/projects/{project.json()['id']}/archive", headers=owner).status_code == 200
    assert client.post(f"/api/v1/projects/{project.json()['id']}/restore", headers=owner).status_code == 200
    assert client.delete(f"/api/v1/projects/{project.json()['id']}", headers=owner).status_code == 204


def test_bulk_update_failure_rolls_back_requirement_audit_and_versions(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Atomic", "key": "ATOMIC"}).json()
    requirement_ids = []
    for title in ("Reviewable", "Draft only"):
        requirement = client.post(f"/api/v1/projects/{project['id']}/requirements", json={
            "title": title, "statement": f"The system shall handle {title.lower()}.", "type": "Functional",
            "priority": "Medium", "sourceType": "Manual", "sourceReference": "Test", "originalText": title,
        }).json()
        requirement_ids.append(requirement["id"])
    assert client.patch(f"/api/v1/requirements/{requirement_ids[0]}", json={"status": "Under review"}).status_code == 200
    failed = client.patch(f"/api/v1/projects/{project['id']}/requirements/bulk", json={
        "requirementIds": requirement_ids, "status": "Approved",
    })
    assert failed.status_code == 409
    records = client.get(f"/api/v1/projects/{project['id']}/requirements").json()
    states = {item["id"]: item["status"] for item in records}
    assert states == {requirement_ids[0]: "Under review", requirement_ids[1]: "Draft"}
    versions = [client.get(f"/api/v1/requirements/{item_id}/versions").json() for item_id in requirement_ids]
    assert [len(rows) for rows in versions] == [2, 1]
    audit = client.get(f"/api/v1/projects/{project['id']}/audit").json()
    assert sum(item["action"] == "requirement_approved" for item in audit) == 0
