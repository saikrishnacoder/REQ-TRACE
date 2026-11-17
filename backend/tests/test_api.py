from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app import models  # noqa: F401 - register ORM models


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
