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
| `GET /api/v1/generation/runs/{id}/`, `/download/`, `POST /generation/files/{id}/review/` | Workspace members may view; Owner/Admin review generated files. Download requires every proposed file to be approved. |

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
