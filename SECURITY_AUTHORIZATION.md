# Security and route authorization

This matrix describes the current FastAPI authorization rules in
`backend/app/main.py`. Unless listed as public, every `/api/v1` route requires
a valid bearer token, an active account, and a current token version. Public
deployments additionally require HTTPS and use Redis-backed shared IP and user
rate limits. A route-coverage test iterates every registered API route and
asserts that it rejects unauthenticated requests.

## Public routes

| Route | Access rule |
| --- | --- |
| `GET /api/v1/health` | Public readiness check; database type and storage durability are reported. HTTPS is enforced on public deployments. |
| `POST /api/v1/auth/login` | Public; shared rate limit. |
| `POST /api/v1/auth/password-reset-requests` | Public; generic response prevents account enumeration; shared rate limit. |
| `POST /api/v1/auth/password-resets` | Public; single-use, hashed, expiring reset token; shared rate limit. |
| `POST /api/v1/desktop/shutdown` | Requires desktop local API token; unavailable when desktop local-token auth is not configured. |

Interactive API documentation is loopback-only and disabled on public hosts.

## Account routes

| Route family | Access rule |
| --- | --- |
| `GET /api/v1/auth/me` | Any active authenticated account. |
| `POST /api/v1/auth/change-password` | Own account; password verification required; increments token version to revoke sessions. |
| `/api/v1/auth/users` (list/create/update) | System Admin only. Deactivation and role changes increment token version; the final active admin cannot be removed. |
| `GET /api/v1/auth/audit` | System Admin only; account security events include actor and subject IDs. |

## Workspace and project routes

| Route family | Access rule |
| --- | --- |
| `/api/v1/workspaces` (list/create) | Authenticated users see only workspaces they belong to; creator becomes Owner. |
| `/api/v1/workspaces/{workspace_id}/members` (list) | Workspace member. |
| `/api/v1/workspaces/{workspace_id}/members` (add/remove) | Workspace Owner or Admin; system Admin bypasses. Membership removal also removes project memberships and audits the change. |
| `/api/v1/projects` (list/create) | List is restricted to workspace membership. Project creation requires workspace access when a workspace is supplied. |
| `/api/v1/projects/{project_id}` and project member list | Workspace member for workspace-backed projects; direct project member only for legacy projects without a workspace. |
| `PATCH /api/v1/projects/{project_id}` | Workspace Owner/Admin/Editor; Viewer is read-only. Owner assignment must remain within the workspace. |
| `POST .../archive`, `POST .../restore`, `DELETE /api/v1/projects/{project_id}` | Workspace Owner/Admin; system Admin bypasses. |
| `POST .../duplicate` | Authenticated project member with Editor-or-higher workspace role. |
| Project member add/remove routes | Workspace Owner/Admin; new member must already belong to the project workspace. |

## Project record routes

All project-scoped record routes require access to the owning project, resolved
through the record's project ID. Workspace membership is the tenant boundary;
legacy project membership never grants access to a workspace-backed project.
Viewers can read; Editors can create and update records. Workspace
Owner/Admin-only actions are enforced for destructive operations and
requirement approval, rejection, verification, and archival.

| Route family | Access rule |
| --- | --- |
| `/api/v1/projects/{project_id}/requirements` and `/api/v1/requirements/{id}` | Project member; write permissions by role; workflow transitions have additional Owner/Admin gates. |
| `/api/v1/requirements/{id}/versions`, `/comments`, `/analyses` | Project member; comments/analysis creation requires Editor-or-higher. |
| `/api/v1/projects/{project_id}/requirements/bulk*` | Project member; edit requires Editor; bulk delete is Owner/Admin. |
| `/api/v1/projects/{project_id}/documents*` | Project member; extraction is Editor-or-higher. |
| `/api/v1/projects/{project_id}/traceability`, `/audit` | Project member, read-only. Audit events carry the authenticated actor ID. |
| `/api/v1/projects/{project_id}/test-cases*`, `/api/v1/test-cases/{id}/executions` | Project member; create/update requires Editor-or-higher. |
| `/api/v1/projects/{project_id}/defects`, `/api/v1/defects/{id}` | Project member; create/update requires Editor-or-higher. |
| `/api/v1/projects/{project_id}/assistant*`, `/api/v1/conversations/{id}*` | Project member; conversation ownership is checked against the project. |
| `/api/v1/projects/{project_id}/github*`, `/api/v1/github/repositories` | Project member for project repository/link operations; system Admin for global repository enumeration. GitHub credentials remain server-side. |
| `/api/v1/projects/{project_id}/automation*` | Project member; changes and runs require Editor-or-higher. |

System Admin is a global role and bypasses workspace/project scope. Editors
have access only through their workspace membership. On public deployments,
`API_HOST`/serverless platform binding is treated as public; the app rejects
startup without auth secret, HTTPS origins, exact HTTPS CORS, TLS Redis, and
TLS email recovery configuration.

## Operational controls

- Forward-only Alembic migrations run at application startup for every database
  mode. A migration failure prevents the API from serving.
- Serverless uses `NullPool` so short-lived functions do not hold idle database
  connections. SQLite on serverless is reported as `ephemeral` and is not a
  supported durable store.
- TLS termination must preserve the HTTPS request scheme at the ASGI layer.
- Store database, Redis, SMTP, AI, and GitHub credentials in the hosting
  provider's secret manager. Do not commit `.env` files or place backend secrets
  in `VITE_*` variables.
