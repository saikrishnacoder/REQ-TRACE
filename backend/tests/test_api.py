from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app import main
from app import models  # noqa: F401 - register ORM models
from app.auth import hash_password
from app.config import settings


@pytest.fixture
def client(tmp_path) -> Generator[TestClient, None, None]:
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'api-test.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        session = test_session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    # Avoid entering the app lifespan so the suite never migrates the user's
    # configured database. Routes use only the isolated dependency override.
    yield TestClient(app)
    app.dependency_overrides.clear()
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
    session_generator = app.dependency_overrides[get_db]()
    db = next(session_generator)
    db.add(models.UserAccount(id="viewer-user", email="viewer@example.test", password_hash=hash_password("test-password-123"), role="Viewer", active=True))
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
    assert client.delete(f"/api/v1/projects/{created.json()['id']}", headers={"Authorization": f"Bearer {token}"}).status_code == 403
    assert client.get("/api/v1/auth/users", headers={"Authorization": f"Bearer {token}"}).status_code == 403
    account = client.post("/api/v1/auth/users", json={"email": "editor@example.test", "password": "editor-password-123", "role": "Editor"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert account.status_code == 201
    assert "passwordHash" not in account.json()
    assert client.patch(f"/api/v1/auth/users/{account.json()['id']}", json={"role": None}, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 422
    editor_token = client.post("/api/v1/auth/login", json={"email": "editor@example.test", "password": "editor-password-123"}).json()["accessToken"]
    assert client.post("/api/v1/projects", json={"name": "Editor Project", "key": "EDIT"}, headers={"Authorization": f"Bearer {editor_token}"}).status_code == 201
    disabled = client.patch(f"/api/v1/auth/users/{account.json()['id']}", json={"active": False}, headers={"Authorization": f"Bearer {admin_token}"})
    assert disabled.status_code == 200 and disabled.json()["active"] is False
    assert client.post("/api/v1/auth/login", json={"email": "editor@example.test", "password": "editor-password-123"}).status_code == 401
    admin_account = client.post("/api/v1/auth/users", json={"email": "second-admin@example.test", "password": "admin-password-123", "role": "Admin"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_account.status_code == 201
    assert client.patch(f"/api/v1/auth/users/{admin_account.json()['id']}", json={"active": False}, headers={"Authorization": f"Bearer {admin_token}"}).status_code == 409
    for _ in range(2):
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


def test_bootstrap_admin_is_only_created_once(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "auth_bootstrap_email", "admin@example.test")
    monkeypatch.setattr(settings, "auth_bootstrap_password", "initial-admin-password")
    session_generator = app.dependency_overrides[get_db]()
    db = next(session_generator)
    monkeypatch.setattr(main, "SessionLocal", lambda: db)
    main.seed_initial_admin()
    first_hash = db.scalar(select(models.UserAccount.password_hash).where(models.UserAccount.email == "admin@example.test"))
    main.seed_initial_admin()
    second_hash = db.scalar(select(models.UserAccount.password_hash).where(models.UserAccount.email == "admin@example.test"))
    assert first_hash == second_hash
    assert db.scalar(select(models.UserAccount.role).where(models.UserAccount.email == "admin@example.test")) == "Admin"
    session_generator.close()
