# SpecForge API authorization

This document describes the current SpecForge Django API implementation.

## Public routes

| Route | Policy |
| --- | --- |
| `GET /api/v1/health/` | Public database readiness check. |
| `POST /api/v1/auth/register/` | Public; validates password and username/email. |
| `POST /api/v1/auth/login/` | Public; returns a 12-hour opaque bearer session. |
| `/api/schema/`, `/api/docs/`, `/api/redoc/` | Public API documentation. |

## Authenticated routes

Every route below requires an active account and valid `Authorization: Bearer`
session. The server stores only a SHA-256 digest of the session token. Logout
revokes that session; expired sessions and inactive accounts are rejected.

| Route | Policy |
| --- | --- |
| `GET/PATCH /api/v1/auth/me/` | Own profile only. Username and email are read-only here. |
| `POST /api/v1/auth/logout/` | Revokes the caller's session. |
| `GET/POST /api/v1/workspaces/` | List only workspaces the caller belongs to; creation assigns caller as Owner. |
| `GET /api/v1/workspaces/{id}/members/` | Workspace members only. |
| `POST /api/v1/workspaces/{id}/members/` | Workspace Owner/Admin can add or change the role of an existing account. |
| `DELETE /api/v1/workspaces/{id}/members/{user_id}/` | Workspace Owner/Admin; owner removal is rejected. |
| `GET /api/v1/projects/`, `GET /api/v1/projects/{id}/` | Workspace members only; other tenants receive an empty list or 404. |
| `POST /api/v1/projects/`, `PATCH /api/v1/projects/{id}/` | Workspace Owner/Admin/Editor. Moving a project between workspaces is rejected. |
| `DELETE /api/v1/projects/{id}/` | Workspace Owner/Admin only. |
| `POST /api/v1/projects/{id}/archive/`, `/restore/` | Workspace Owner/Admin only. |
| `POST /api/v1/projects/{id}/duplicate/` | Workspace Owner/Admin/Editor. |
| `GET /api/v1/projects/{id}/activity/` | Workspace members only. Events carry actor attribution. |
| `GET /api/v1/projects/{id}/generation/readiness/`, `GET /generation/plans/`, `GET /generation/plans/{id}/` | Workspace members only. Approved input records are project-scoped. |
| `POST /api/v1/projects/{id}/generation/plans/`, `PATCH /api/v1/generation/plans/{id}/` | Workspace Owner/Admin/Editor; only a pending blueprint can be edited. Approved input IDs, source snapshots and checksums are server-managed. |
| `POST /api/v1/generation/plans/{id}/approve/`, `/reject/` | Workspace Owner/Admin only. Approval is rejected until every clarification is answered or marked not applicable with a reason, and current approved sources still match the snapshot. |
| `POST /api/v1/generation/plans/{id}/runs/` | Workspace Owner/Admin/Editor; requires an approved, unchanged blueprint and server-side provider configuration. |
| `POST /api/v1/generation/plans/{id}/scaffold/` | Workspace Owner/Admin/Editor; requires an approved blueprint and unchanged approved source snapshot. Returns a private, no-store ZIP and records an attributed activity event; never writes into an existing project directory. |
| `GET /api/v1/generation/runs/{id}/`, `/download/`, `POST /generation/files/{id}/review/` | Workspace members may view; Owner/Admin review generated files. Download requires every proposed file to be approved. |
| `/api/v1/projects/{project_id}/requirements/`, `/requirements/{id}/` | GET/POST list/create; GET/PATCH/PUT/DELETE retrieve/update/archive/delete. Workspace members read; Owner/Admin/Editor write; Owner/Admin delete. Search: `search`; filters: `status`, `category`, `priority`; page-number pagination. Updates increment requirement version and clear approval state. |
| `/api/v1/projects/{project_id}/requirements/{id}/versions/`, `/submit-review/` | Version history GET; submit-review POST for Editor or higher. Owner/Admin approves/rejects through the approval decision endpoint. |
| `/documents/`, `/documents/{id}/` | GET/POST upload, GET/DELETE retrieve/delete. Owner/Admin/Editor writes; max 20 MB; PDF/DOCX/TXT/MD extensions. TXT/MD UTF-8 extraction runs synchronously; other formats remain Uploaded. |
| `/design-artifacts/`, `/design-artifacts/{id}/` | GET/POST list/create; GET/PATCH/PUT/DELETE retrieve/version/delete. Edits create a new version; kind/title cannot change in a version. Approval requests go through `/approvals/`. |
| `/business-analyses/`, `/business-objectives/`, `/stakeholders/`, `/personas/` | Project-scoped GET/POST/PATCH/PUT/DELETE CRUD. Business analysis updates create new versions. Persona validation is Owner/Admin only. |
| `/test-suites/`, `/test-cases/`, `/test-executions/` | Project-scoped GET/POST/PATCH/PUT/DELETE; execution POST records the authenticated executor and real result/evidence values. Related suite, test case and requirement IDs must belong to the same project. |
| `/traceability-links/`, `/traceability-links/{id}/confirm/`, `/reject/` | Owner/Admin/Editor propose links to existing project artefacts; Owner/Admin confirm/reject. Cross-project and unsupported artefact references are rejected. |
| `/approvals/`, `/approvals/{id}/decision/` | Owner/Admin/Editor may request approval for current-version requirements, designs, business analysis/objectives and extracted-ready source documents. Only Owner/Admin may decide; decisions are attributed and transactional. |

## Current security limits

- The browser stores its short-lived bearer token in `sessionStorage`. Same
  origin JavaScript can read it; replace this with a carefully configured
  HttpOnly cookie/CSRF flow or an identity provider before production.
- Password recovery, email invitations, and shared rate limiting are not yet
  implemented.
- Django production settings require explicit allowed hosts, HTTPS CORS/CSRF
  origins, a strong secret and a MySQL connection with a trusted TLS CA.
- SQLite is for local development and tests only. Do not use it for shared
  deployment persistence.
- No production MySQL connection or deployment has been verified.
- Generic approval records are checked against project, artefact type, ID,
  version and decision before SRS/design data is included. SRS source content is
  limited to 200 KB per approved document in the pinned plan snapshot.
- API request/response schemas and bearer authentication are published through
  OpenAPI. Related approved requirement IDs are currently unavailable because
  the configured local project database contains zero approved requirements.
- The checked environment has no MySQL service or Docker executable. Live MySQL
  connection testing remains outstanding; local backend tests use SQLite.
