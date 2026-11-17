import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, get_db
from app.models import AuditEvent, Project, Requirement, RequirementLink, SyncOutboxEvent
from app.schemas import AuditEventRead, ProjectCreate, ProjectRead, RequirementCreate, RequirementLinkCreate, RequirementLinkRead, RequirementRead, RequirementUpdate, TraceabilityRead

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # A desktop install must be usable immediately and persist records locally.
    # Server deployments use the same schema but are initialized explicitly.
    if settings.database_mode.casefold() == "local":
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        command.upgrade(config, "head")
    yield


app = FastAPI(
    title="ReqTrace API",
    version="0.2.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://tauri.localhost",
        "tauri://localhost",
    ],
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def append_audit(db: Session, project_id: str, action: str, requirement_id: str | None = None, detail: dict | None = None) -> None:
    db.add(AuditEvent(
        id=str(uuid.uuid4()),
        project_id=project_id,
        requirement_id=requirement_id,
        action=action,
        detail=json.dumps(detail or {}, ensure_ascii=False),
    ))


def append_sync_event(db: Session, event_type: str, entity_type: str, entity_id: str, payload: dict) -> None:
    db.add(SyncOutboxEvent(
        id=str(uuid.uuid4()),
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    ))


@app.get("/api/v1/health")
def health(db: Session = Depends(get_db)):
    try:
        query = "SELECT 1 FROM DUAL" if engine.dialect.name == "oracle" else "SELECT 1"
        db.execute(text(query))
        return {
            "status": "ok",
            "database": engine.dialect.name,
            "mode": settings.database_mode,
            "storage": "persistent",
        }
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="The configured database is unavailable") from exc


@app.get("/api/v1/projects", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db)):
    return list(db.scalars(select(Project).order_by(Project.created_at.desc())).all())


@app.post("/api/v1/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, response: Response, db: Session = Depends(get_db)):
    if payload.id and (existing := db.get(Project, payload.id)) is not None:
        return existing
    created_at = datetime.now(timezone.utc)
    project = Project(
        id=payload.id or str(uuid.uuid4()),
        name=payload.name.strip(),
        key=payload.key.strip().upper(),
        description=payload.description.strip(),
        created_at=created_at,
    )
    db.add(project)
    append_audit(db, project.id, "project_created", detail={"name": project.name, "key": project.key})
    append_sync_event(db, "project.upsert", "project", project.id, {
        "id": project.id,
        "name": project.name,
        "key": project.key,
        "description": project.description,
        "createdAt": created_at.isoformat(),
    })
    try:
        db.commit()
        db.refresh(project)
        return project
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A project with this key already exists") from exc


@app.get("/api/v1/projects/{project_id}/requirements", response_model=list[RequirementRead])
def list_requirements(project_id: str, db: Session = Depends(get_db)):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    query = select(Requirement).where(
        Requirement.project_id == project_id,
        Requirement.deleted_at.is_(None),
    ).order_by(Requirement.created_at.desc())
    return list(db.scalars(query).all())


@app.post("/api/v1/projects/{project_id}/requirements", response_model=RequirementRead, status_code=status.HTTP_201_CREATED)
def create_requirement(project_id: str, payload: RequirementCreate, db: Session = Depends(get_db)):
    project = db.scalar(select(Project).where(Project.id == project_id).with_for_update())
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if payload.id and (existing := db.get(Requirement, payload.id)) is not None:
        return existing

    number = project.next_requirement_number
    project.next_requirement_number = number + 1
    code = payload.code or f"{project.key}-{number:03d}"
    created_at = datetime.now(timezone.utc)
    requirement = Requirement(
        id=payload.id or str(uuid.uuid4()),
        project_id=project_id,
        code=code,
        title=payload.title.strip(),
        statement=payload.statement.strip(),
        requirement_type=payload.requirement_type,
        priority=payload.priority,
        actor=payload.actor.strip(),
        preconditions=payload.preconditions.strip(),
        acceptance_criteria=payload.acceptance_criteria,
        source_type=payload.source_type,
        source_reference=payload.source_reference.strip(),
        original_text=payload.original_text,
        status="Draft",
        created_at=created_at,
        updated_at=created_at,
    )
    db.add(requirement)
    append_audit(db, project_id, "requirement_created", requirement.id, {"code": code, "sourceType": payload.source_type})
    append_sync_event(db, "requirement.upsert", "requirement", requirement.id, {
        "id": requirement.id,
        "projectId": requirement.project_id,
        "code": requirement.code,
        "title": requirement.title,
        "statement": requirement.statement,
        "type": requirement.requirement_type,
        "priority": requirement.priority,
        "actor": requirement.actor or "",
        "preconditions": requirement.preconditions or "",
        "acceptanceCriteria": requirement.acceptance_criteria,
        "sourceType": requirement.source_type,
        "sourceReference": requirement.source_reference,
        "originalText": requirement.original_text,
        "status": requirement.status,
        "createdAt": created_at.isoformat(),
        "updatedAt": created_at.isoformat(),
        "reviewedAt": None,
    })
    try:
        db.commit()
        db.refresh(requirement)
        return requirement
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Requirement ID or project code already exists") from exc


@app.patch("/api/v1/requirements/{requirement_id}", response_model=RequirementRead)
def update_requirement(requirement_id: str, payload: RequirementUpdate, db: Session = Depends(get_db)):
    requirement = db.get(Requirement, requirement_id)
    if requirement is None:
        raise HTTPException(status_code=404, detail="Requirement not found")
    if requirement.status in {"Approved", "Rejected"}:
        raise HTTPException(status_code=409, detail="Approved and rejected records are read-only in Phase 1")

    updates = payload.model_dump(exclude_unset=True, by_alias=False)
    requested_status = updates.pop("status", None)
    allowed = {
        "Draft": {"Draft", "Under review"},
        "Under review": {"Under review", "Approved", "Rejected"},
    }
    if requested_status and requested_status not in allowed[requirement.status]:
        raise HTTPException(status_code=409, detail=f"Invalid status change: {requirement.status} → {requested_status}")

    for field, value in updates.items():
        if value is not None:
            setattr(requirement, field, value)
    requirement.updated_at = datetime.now(timezone.utc)
    if requested_status:
        requirement.status = requested_status
        if requested_status in {"Approved", "Rejected"}:
            requirement.reviewed_at = datetime.now(timezone.utc)

    action = {
        "Under review": "requirement_submitted_for_review",
        "Approved": "requirement_approved",
        "Rejected": "requirement_rejected",
    }.get(requested_status, "requirement_updated")
    append_audit(db, requirement.project_id, action, requirement.id, {"fields": sorted(updates), "status": requested_status})
    append_sync_event(
        db,
        "requirement.upsert",
        "requirement",
        requirement.id,
        RequirementRead.model_validate(requirement).model_dump(mode="json", by_alias=True),
    )
    db.commit()
    db.refresh(requirement)
    return requirement


@app.delete("/api/v1/requirements/{requirement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_requirement(requirement_id: str, db: Session = Depends(get_db)) -> Response:
    requirement = db.get(Requirement, requirement_id)
    if requirement is None or requirement.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Requirement not found")

    deleted_at = datetime.now(timezone.utc)
    requirement.deleted_at = deleted_at
    append_audit(db, requirement.project_id, "requirement_deleted", requirement.id, {"code": requirement.code})
    append_sync_event(db, "requirement.delete", "requirement", requirement.id, {
        "id": requirement.id,
        "projectId": requirement.project_id,
        "deletedAt": deleted_at.isoformat(),
    })
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/projects/{project_id}/audit", response_model=list[AuditEventRead])
def list_audit_events(project_id: str, db: Session = Depends(get_db)):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    query = select(AuditEvent).where(AuditEvent.project_id == project_id).order_by(AuditEvent.created_at.desc())
    return list(db.scalars(query).all())


@app.get("/api/v1/projects/{project_id}/traceability", response_model=TraceabilityRead)
def project_traceability(project_id: str, db: Session = Depends(get_db)):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    requirements = list(db.scalars(
        select(Requirement)
        .where(Requirement.project_id == project_id, Requirement.deleted_at.is_(None))
        .order_by(Requirement.code)
    ).all())
    links = list(db.scalars(
        select(RequirementLink)
        .where(RequirementLink.project_id == project_id)
        .order_by(RequirementLink.created_at.desc())
    ).all())
    linked_ids = {item.source_requirement_id for item in links} | {item.target_requirement_id for item in links}
    orphan_ids = [item.id for item in requirements if item.id not in linked_ids]
    linked_percent = round((len(requirements) - len(orphan_ids)) * 100 / len(requirements)) if requirements else 0
    return {
        "requirements": requirements,
        "links": links,
        "orphan_requirement_ids": orphan_ids,
        "linked_percent": linked_percent,
    }


@app.post("/api/v1/requirements/{requirement_id}/links", response_model=RequirementLinkRead, status_code=status.HTTP_201_CREATED)
def create_requirement_link(requirement_id: str, payload: RequirementLinkCreate, db: Session = Depends(get_db)):
    source = db.get(Requirement, requirement_id)
    target = db.get(Requirement, payload.target_requirement_id)
    if source is None or source.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Source requirement not found")
    if target is None or target.deleted_at is not None or target.project_id != source.project_id:
        raise HTTPException(status_code=404, detail="Target requirement not found in this project")
    if source.id == target.id:
        raise HTTPException(status_code=422, detail="A requirement cannot link to itself")
    duplicate = db.scalar(select(RequirementLink).where(
        RequirementLink.source_requirement_id == source.id,
        RequirementLink.target_requirement_id == target.id,
        RequirementLink.relationship_type == payload.relationship_type,
    ))
    if duplicate is not None:
        raise HTTPException(status_code=409, detail="This relationship already exists")

    link = RequirementLink(
        id=str(uuid.uuid4()),
        project_id=source.project_id,
        source_requirement_id=source.id,
        target_requirement_id=target.id,
        relationship_type=payload.relationship_type,
    )
    db.add(link)
    append_audit(db, source.project_id, "requirement_link_created", source.id, {
        "targetRequirementId": target.id,
        "relationshipType": payload.relationship_type,
    })
    append_sync_event(db, "requirement_link.upsert", "requirement_link", link.id, {
        "id": link.id,
        "projectId": link.project_id,
        "sourceRequirementId": link.source_requirement_id,
        "targetRequirementId": link.target_requirement_id,
        "relationshipType": link.relationship_type,
    })
    db.commit()
    db.refresh(link)
    return link


@app.delete("/api/v1/requirements/{requirement_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_requirement_link(requirement_id: str, link_id: str, db: Session = Depends(get_db)) -> Response:
    link = db.scalar(select(RequirementLink).where(
        RequirementLink.id == link_id,
        RequirementLink.source_requirement_id == requirement_id,
    ))
    if link is None:
        raise HTTPException(status_code=404, detail="Requirement relationship not found")
    append_audit(db, link.project_id, "requirement_link_deleted", requirement_id, {
        "linkId": link.id,
        "targetRequirementId": link.target_requirement_id,
        "relationshipType": link.relationship_type,
    })
    append_sync_event(db, "requirement_link.delete", "requirement_link", link.id, {"id": link.id})
    db.delete(link)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/")
def root():
    return {"name": "ReqTrace API", "docs": "/api/docs"}
