import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, get_db
from app.models import AuditEvent, Project, Requirement, SyncOutboxEvent
from app.schemas import AuditEventRead, ProjectCreate, ProjectRead, RequirementCreate, RequirementRead, RequirementUpdate

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # A desktop install must be usable immediately and persist records locally.
    # Server deployments use the same schema but are initialized explicitly.
    if settings.database_mode.casefold() == "local":
        Base.metadata.create_all(bind=engine)
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
    query = select(Requirement).where(Requirement.project_id == project_id).order_by(Requirement.created_at.desc())
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


@app.get("/api/v1/projects/{project_id}/audit", response_model=list[AuditEventRead])
def list_audit_events(project_id: str, db: Session = Depends(get_db)):
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    query = select(AuditEvent).where(AuditEvent.project_id == project_id).order_by(AuditEvent.created_at.desc())
    return list(db.scalars(query).all())


@app.get("/")
def root():
    return {"name": "ReqTrace API", "docs": "/api/docs"}
