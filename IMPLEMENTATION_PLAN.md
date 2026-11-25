# ReqTrace AI implementation plan

This plan follows the user's attached ReqTrace requirements specification and
the shared **Complete Project Setup Guide** conversation. The user's later
Vercel deployment direction selects hosted PostgreSQL for the shared service;
Oracle remains a supported alternate adapter. Phase 01 configures PostgreSQL
through psycopg 3. Its offline +
team operation, desktop-first interface, staged delivery, and separation of
local and shared storage remain the product direction.

## Target architecture

- **Desktop:** Tauri 2 shell around React + TypeScript.
- **Local API:** Python + FastAPI sidecar bound to loopback.
- **Offline data:** SQLite under the user's application data directory; the
  browser keeps a recovery cache and retry queue.
- **Shared data:** Hosted PostgreSQL through the same API contract on an
  authenticated service. Oracle remains supported as an alternate enterprise
  adapter. Desktop clients use the API and never connect directly to the DB.
- **AI and analysis:** add only after source handling, permissions, persistence,
  and evidence trails are in place.

## Delivery sequence

1. **Offline foundation:** desktop shell, managed Python startup, SQLite
   persistence, project creation, requirement intake, review, and audit trail.
2. **Oracle team service:** Oracle schema migrations, user and organization
   authentication, role-based access, server API, and authenticated sync.
3. **Traceability:** immutable approved versions, audit history,
   requirement-to-test links, and missing-test analysis.
4. **AI and source intelligence:** document parsing, reviewable extraction,
   evidence-grounded answers, Python AST indexing, and drift scans.
5. **Controlled execution:** isolated approved-test runner, recorded evidence,
   and confirmed voice actions.
6. **Release:** packaged Python sidecar, Tauri installer, upgrade-safe local
   migrations, backup and restore, and clean-machine verification.

## Security and hosted deployment update (2026-11-25)

The service now has workspace tenant scoping, a registered-route authorization
test, account password change and recovery, revocable sessions, actor-attributed
audit events, and Redis-backed shared rate limits. Public deployment checks
require TLS PostgreSQL/Oracle, HTTPS origins, exact CORS origins, TLS Redis, and
TLS email recovery. Alembic migrations run at app startup and PostgreSQL cold
starts serialize through an advisory lock. Vercel uses `backend/index.py` and
the repository-root SPA rewrite; SQLite is reported ephemeral there. Dedicated
Documents and Activity screens now use the real persistent APIs.

The live deployment remains unverified until a Vercel project, persistent
database, Redis, SMTP credentials, and environment secrets are configured.

## Current build boundary

The local SQLite, PostgreSQL and Oracle adapters, Alembic history,
Tauri/PyInstaller packaging, and product modules have since been implemented
incrementally. Oracle server
mode remains a database development adapter, not a production team service.
Oracle mode now requires an initial bearer-authentication foundation with
global roles, but remote synchronization and project-level authorization are
incomplete. Keep the API on loopback; no network service is safe to expose
until the remaining controls and deployment verification are complete.

## Audit and hardening update (historical baseline, 2026-11-17)

See [`AUDIT_REPORT.md`](AUDIT_REPORT.md) for the repository-wide baseline and
route inventory. The first follow-up slices add non-destructive Alembic
bootstrap/upgrade support, a soft-delete migration with retained audit history,
priority filtering, sorting, pagination, CSV export, a dark navy/violet theme,
an explicit not-found page, and visible storage/sync errors. A persisted
requirement-to-requirement traceability module then created/removed links,
recorded link audit events, and reported linked/orphan requirements. Subsequent
sections below document the product modules added after that baseline. Current
status and remaining work are in the audit report.

## Test management and defect register slice (2026-11-17)

The next phase now has a first vertical slice: test cases store preconditions,
ordered steps, expected results, and an optional requirement link; defects store
severity/status and optional requirement/test-case links. Both are
project-scoped, audited, and covered by Alembic revision `20261117_0004`.
The `/tests` and `/defects` routes provide create/list/status workflows.
Automated execution, run evidence, richer defect editing, and full traceability
visualization remain outstanding. The new slice passes the API and migration
tests and TypeScript check; a fresh sidecar/installer build is still required.

## AI requirement intelligence slice (2026-11-17)

Revision `20261117_0005` stores validated analysis history. `/ai` is a working
requirement-by-requirement review workflow with provider labels, local
heuristic fallback, and user acceptance of suggested criteria. OpenAI-
compatible provider configuration is server-only (`AI_API_KEY`, `AI_BASE_URL`,
`AI_MODEL`) and must be placed in the ignored backend `.env` or deployment
environment. No key is included in the frontend or source control. External
provider behavior remains unverified without credentials. AI test generation,
grounded assistant conversations, and saved analysis history are now implemented.
Streaming responses and accept/reject/edit controls for every AI suggestion type
remain future work.

## Manual test execution history slice (2026-11-17)

Revision `20261117_0006` persists each manual execution with status and actual
result. The test case screen can record Passed, Failed, Blocked, or Skipped
runs and inspect prior execution history. Events are audited and queued for
future sync. Test suite management, tester assignment, automated execution,
and run evidence attachments remain outstanding. TypeScript and all 12 backend
tests pass; the packaged Windows installer and sidecar smoke test pass for this
revision (28.84 MiB installer).

The overview now reads test-case coverage, recorded run pass rate, open defects,
and audit activity from the local API, and refreshes on demand. Requirement
counts and status distribution use the active project records. API-dependent
metrics use an explicit unavailable state while offline. Date filters, trend
visualizations, and report export remain planned.

## Grounded assistant slice (2026-11-17)

Revision `20261117_0007` adds project-scoped conversation/message tables. The
assistant retrieves matching requirements, test cases, and defects, returns
record citations, and stores both sides of the conversation. It uses the
configured server-side AI provider when available and an explicitly labeled
local-search response otherwise. Cross-project conversation access is
rejected. Streaming, regenerate, and richer semantic retrieval remain future
work. TypeScript and all 14 backend tests pass; the refreshed installer and
packaged-sidecar smoke test pass (28.85 MiB installer).

## GitHub read-only integration slice (2026-11-17)

Revision `20261117_0008` stores connected repositories, imported GitHub records,
and links from requirements. The `/github` page syncs repository metadata,
issues, pull requests, commits, and branches through a server-side token and
offers requirement linking. It uses manual pull only; no token is sent to the
frontend. A mocked provider test checks import/link and non-disclosure. Configure
a least-privilege `GITHUB_TOKEN` in the ignored backend `.env` to use it. No
live account token is present here; OAuth, webhooks, pagination, and background
sync remain future work. TypeScript and all 15 backend tests pass; the
refreshed installer and packaged-sidecar smoke test pass (28.86 MiB installer).

## Reports slice

The `/reports` route builds requirement progress, test execution history, and
defect analysis from current project state and persisted API records. It
supports refresh and CSV export with spreadsheet-formula cells neutralized.
PDF/XLSX, date filters, and scheduled report generation are still open.
TypeScript and Vite builds pass, and the refreshed 28.86 MiB installer plus
packaged-sidecar smoke test pass.

## Automation checks slice

Revision `20261117_0009` adds persisted rule enablement and execution history.
The `/automation` page exposes three read-only checks: orphan requirements,
requirements without linked tests, and open critical defects. Users enable a
rule before triggering it; results and finding lists are saved and audited.
No automatic notifications, schedules, or write actions run. API tests cover
enablement, execution results, disabled-run rejection, and history. Installer
packaging and sidecar smoke test pass; TypeScript and all 16 backend tests
pass. The refreshed 28.87 MiB installer includes this migration.

## Requirement history and discussion slice

Revision `20261117_0010` adds immutable requirement snapshots and project
comments. Requirement creation stores the initial snapshot; every accepted
update stores the resulting version. The requirement drawer shows version
history and supports comments. Both changes generate audit and sync-outbox
records. Initial history and comment endpoints are covered by API tests.
All 16 backend tests and TypeScript checks pass, and the refreshed 28.87 MiB
installer passed the packaged-sidecar migration/health smoke test.

The requirement list now imports validated UTF-8 CSV rows through the existing
persisted create path, reports invalid row numbers, and exports with formula
neutralization. Type and priority values are checked before creating records.
Excel import and bulk field editing beyond priority remain planned.

The test management page also generates structured suggestions from a selected
requirement. Provider output is schema-validated; the fallback uses acceptance
criteria and remains clearly labeled. Suggestions are review-only until a user
adds a case. The fallback/no-auto-save API test passes as part of the 17-test
backend suite.

The `/projects` route lists project workspaces and switches the active project.
The requirements list supports confirmed bulk priority changes on selected
editable records. Approved and rejected baseline records are excluded from
selection. Test generation was added from requirement context with explicit
user review before saving. TypeScript and all 17 backend tests pass. The
refreshed 28.88 MiB installer passed the packaged-sidecar smoke test.

## Authenticated API foundation (2026-11-18)

Revision `20261118_0011` adds persistent user accounts. Oracle mode requires
authentication by default; the initial administrator is provisioned from
server-only bootstrap environment variables. Passwords use PBKDF2-HMAC-SHA256
hashes, bearer tokens are HMAC-signed with a configurable short expiration,
and the app uses tab-scoped session storage with a sign-in gate and sign-out.
Admin can create/list/deactivate accounts; global Admin/Editor/Viewer guards
protect writes and deletes. In-process request limits throttle login and API
traffic. API tests cover bootstrap idempotency, login, token tampering, role
guards, account deactivation, last-admin protection, and throttling. TypeScript,
all 20 backend tests, Windows packaging, and the post-package sidecar suite pass.

This is not yet safe for shared network deployment: roles are global, projects
are now isolated by Editor/Viewer memberships at project and record routes,
existing tokens remain valid until expiry after an account is deactivated,
password reset is absent, and in-memory rate limits do not coordinate across
multiple workers. The admin/member workflows are API-only. No live Oracle
startup was available to verify migration/bootstrap against an Oracle instance.

## Project membership authorization slice (2026-11-18)

Revision `20261118_0012` adds project/user membership records with Editor or
Viewer roles. System Admins manage memberships through `/api/v1/projects/{id}/members`.
Non-admin project listings are filtered by membership; a shared authorization
dependency checks project-scoped routes and resolves requirement, case, defect,
and conversation IDs before granting access. Project creators with the Editor
role receive Editor membership automatically. Tests cover project filtering,
assignment/removal, record-ID route checks, Viewer write rejection, and
cross-project project-ID replay. The project settings page now provides an
Admin membership surface to assign, create, and remove project access. Global
account lifecycle still uses the API. These guards do not provide organization
tenancy; an exhaustive API authorization review and live Oracle migration
check remain open.

## Current audit against the master prompt (2026-11-18)

See [`AUDIT_REPORT.md`](AUDIT_REPORT.md) for the route inventory, evidence,
and limitation register. The previous baseline findings in this plan have
been superseded by the progress records above. The latest traceability
milestone adds requirement-linked test/run/defect/GitHub references to the
matrix; it does not model design components or development task records.

### Delivery gates still open

1. **Secure shared service (P0):** auth now provides a bootstrap admin, PBKDF2
   password hashes, expiring HMAC bearer tokens, database-verified current
   account roles/status, project memberships, filtered project lists,
   record-route guards, account/member admin APIs, and per-process request
   limits. Still implement password reset, distributed rate limiting, organization
   tenancy, audit actor attribution, global account lifecycle UI, and
   deployment hardening.
   Audit every API family and verify Oracle deployment before network access.
2. **Testing completeness:** add browser E2E tests for route loading, forms,
   CRUD, responsive navigation, and offline recovery; perform keyboard and
   screen-reader checks; install and upgrade the NSIS artifact on a clean
   Windows environment.
3. **Domain completeness:** add suites and assignment; broaden defect fields
   and history; model design/task trace records; add remaining analytics,
   exports, and controlled automation capabilities from the master prompt.
4. **Operational readiness:** verify live Oracle migrations, backup/restore,
   AI/GitHub integrations with least-privilege test credentials, structured
   logs, and scale behavior. Credentials and an Oracle environment were not
   available during this audit.

## Product audit slice (2026-11-20)

The browser smoke audit rendered all current application routes and the
not-found route without console errors. The project gained a first persisted-
data knowledge graph for requirements, tests, defects, and GitHub references,
with search, entity filtering, zoom, selection, and relationship details.
Design/task/objective/evidence/risk/document/decision records, graph dragging,
path highlighting, export, and automated browser coverage remain open.

The API now resolves account activity and role from the database on each
authenticated request so deactivation and role changes revoke old token
permissions immediately. CORS origins are configurable through
`CORS_ALLOWED_ORIGINS`. TypeScript, Vite build, production npm audit, Python
dependency checks, and all 21 backend tests pass. This is not deployment
approval: no domain or server target was identified, the Hostinger account
lookup did not return, and the existing shared-service security and live
Oracle gates remain open.

These are gates, not completed deliverables. The current implementation is a
local-first functional build and must not be represented as an authenticated
team SaaS product.
