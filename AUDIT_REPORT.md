# ReqTrace AI technical audit and implementation report

Audit refreshed: 2026-11-25. This report reflects the current repository, not
the original baseline. Feature claims below are limited to checked-in source
and automated checks. External providers and a clean-machine install have not
been verified unless explicitly stated.

## Security and hosting refresh (2026-11-25)

The former security/deployment gaps listed below are superseded for the local
codebase: workspace membership is the tenant boundary; account lifecycle now
includes password change, one-time password recovery, audit attribution, and
token revocation; public deployments require HTTPS origins, explicit CORS,
TLS Postgres/Redis/SMTP, and shared rate limiting. Public startup runs forward
Alembic migrations under a PostgreSQL advisory lock. Vercel now has an explicit
backend entrypoint, an SPA fallback, `NullPool`, and `storage: ephemeral` for
SQLite. Dedicated Documents and Activity screens call the persisted API.

Validation added with this refresh includes a registered-route auth sweep,
workspace boundary and recovery flows, serverless storage/config tests, and
front-end production build. On 2026-11-25 the configured backend URL returned
HTTP 500 `FUNCTION_INVOCATION_FAILED`. Vercel's request logs redirected to its
login screen, and this checkout has no linked Vercel project or CLI, so the
startup exception and production environment values could not be inspected.
Treat the live API as unavailable until those logs and variables are checked.
Do not relax the fail-closed startup checks to hide this failure.

The initial follow-up implementation expands the tenant-boundary test to cover
project documents, requirements, audit, traceability, cases, executions,
defects, conversations, GitHub records, automation, and requirement-owned
records/actions. It verifies that an unrelated workspace membership and a
legacy project-membership row do not grant cross-workspace access. This is a
representative route family matrix; a complete role/action matrix remains open.

## Architecture

- React 19, TypeScript, Vite, and React Router form the UI; Tauri 2 packages
  the Windows desktop app.
- Python FastAPI and synchronous SQLAlchemy provide the local API and server
  adapters. PyInstaller bundles the local sidecar.
- SQLite is the local durable database. PostgreSQL uses psycopg 3; Oracle uses
  `python-oracledb`. Alembic manages schema migrations. The browser also has a
  local cache and write outbox.
- AI-compatible provider calls and GitHub API requests run on the Python
  server; their credentials are not included in browser responses.

## Module status

| Module | Current implementation | Verified status / remaining work |
|---|---|---|
| Navigation and routes | Overview, projects, requirements, intake, documents, activity, project settings/access, traceability, tests, defects, AI, assistant, GitHub, reports, automation, account/security, and not-found route | Routes are implemented in `src/App.tsx`; API-backed Documents and Activity pages were added in the 2026-11-25 refresh. Automated browser route/form coverage is still absent. |
| Dashboard | Project and requirement KPIs, test/run/defect metrics, status distribution, recent audit activity, refresh | Uses persisted API data. Date filters, trend charts, and a richer activity feed remain open. |
| Requirements | Ten categories, eight states, description/statement, owner, verification method, tags, version number/history, approval lifecycle, source extraction/provenance, search/filter/sort/pagination, configurable columns, inline priority/status edit, generalized bulk update/delete, CSV import/export, comments, R-R links | SQLite API behavior, version/audit writes, source extraction, bulk transactions, and workspace access are tested. OCR and Excel/PDF exports remain open. Uploaded binary data is discarded after supported text extraction; extracted text is persisted. |
| Projects and workspaces | Project CRUD, archive/restore/duplicate, category/owner/team/status/priority/dates/objectives, workspace membership and role boundaries | API CRUD and member isolation are tested. Project owner/team controls and broader workspace management UI remain limited; routes and data model are available. |
| AI intelligence | Structured requirement analysis, history, heuristic fallback, criteria recommendations, reviewable test suggestions | Fallback/schema behavior is tested. Live provider behavior needs credentials and has not been verified. Duplicate/contradiction analysis across the corpus and accept/reject/edit for all suggestion types remain open. |
| Traceability | Requirement relationship links, test cases, latest runs, defects, GitHub requirement references, orphan/test coverage, failed case metrics | API and UI matrix implemented. A knowledge graph now renders persisted requirement, test, defect, and linked GitHub records with search, type filters, zoom, and record details. Design components and development task references are not modeled; graph pan/drag, path highlighting, export, and minimap remain open. |
| Test management | Manual case CRUD, requirement links, ordered steps, AI suggestions, execution status/history | API checks cover cases, runs, and suggestion persistence behavior. Test suites, assignment, priorities/types, attachments, and automated execution remain open. |
| Defects | Creation, severity/status, requirement and case links | Core API behavior tested. Assignment, comments, reproduction fields, attachments, and full resolution history remain open. |
| GitHub | Server token configuration, manual read-only import of repository metadata/issues/PRs/commits/branches, requirement links | Mocked provider path and token non-disclosure tested. Live account access is unverified. OAuth, webhook, pagination beyond the first 100 items per endpoint, and token vaulting are absent. |
| Assistant | Project-scoped stored conversations, retrieval from project records, cited sources, local fallback | API tests cover fallback/history/scoping. Live AI calls, streaming, regenerate, copy, and richer context selection are unverified or absent. |
| Reports | Persisted requirement, test execution, and defect views; CSV export | CSV path is implemented. PDF/XLSX, AI analysis report, filters, and scheduled reports remain open. |
| Automation | Enable/disable and manually run three read-only quality rules with stored results | API behavior tested. Schedules, notifications, actor permissions, and background triggers remain open. |
| Database and migrations | Workspaces/memberships, project lifecycle metadata, requirement detail/tags/version number, security account events/token versions, forward revisions through `20261125_0015`, SQLite/PostgreSQL/Oracle adapters | SQLite migration upgrades and preservation tests pass; application startup migrates all database modes and serializes PostgreSQL cold starts. Live PostgreSQL/Oracle upgrades and backup/restore remain unverified. |
| UI/UX | Dark navy/violet styling, responsive breakpoints, shared controls, empty/error states, sidebar and breadcrumb | Desktop build passes. Formal accessibility, keyboard/focus behavior, visual browser checks at target breakpoints, and reusable toast/skeleton/tooltip components remain incomplete. |
| Security | Loopback sidecar default, server-side secrets, input schemas, signed-token auth, workspace Owner/Admin/Editor/Viewer roles, per-request token-version validation, route coverage, account recovery, configurable CORS, actor-attributed audit | Workspace isolation and route-by-route unauthenticated rejection are tested. Redis provides shared public rate limits; public config fails closed on missing HTTPS origins, TLS database, Redis, or email recovery. Live deployment/infra verification remains open. Local browser/SQLite data is not encrypted. |
| Performance and operations | Project-scoped APIs and persistent local storage | Some routes load complete project collections; large-scale pagination/index review, structured logs, request IDs, and operational monitoring remain open. |
| Automated quality | Backend pytest suite, TypeScript check, desktop installer build and sidecar smoke test | Current run: 48 backend tests passed; `tsc --noEmit` and Vite production build passed; Windows NSIS installer exists at `src-tauri/target/release/bundle/nsis/ReqTrace AI_0.1.0_x64-setup.exe` (30,297,675 bytes). One Starlette/httpx deprecation warning remains. No live hosted database/Redis/SMTP, frontend E2E suite, or clean-machine installer verification. |

## Route inventory

| Path | Behavior |
|---|---|
| `/` | Persisted workspace overview |
| `/projects`, `/new-project` | Project list/switching and creation |
| `/projects` lifecycle controls | Rename, duplicate, archive/restore, delete; workspace creation and selection for new projects |
| `/requirements` | Search, status/priority filters, sort, page, configurable columns, inline status/priority, import/export, bulk priority/status/owner/tags/delete, edit/review/history/comments |
| `/intake` | Manual, conversation, PDF/DOCX/TXT/MD/CSV extraction, candidate selection, and source-linked requirement creation |
| `/documents` | Project source library, document extraction, candidate statements, and extracted text |
| `/activity` | Searchable actor-attributed project audit with CSV export |
| `/project` | Active project details |
| `/traceability` | Requirement, test, run, defect, and GitHub reference matrix |
| `/knowledge-graph` | Interactive persisted-record graph for requirements, tests, defects, and GitHub references; search, entity filter, zoom, selection, and details |
| `/tests` | Test case creation, suggestion review, manual runs, and history |
| `/defects` | Defect creation and status changes |
| `/ai` | Requirement analysis and persisted results |
| `/assistant` | Project-record Q&A with conversation history and citations |
| `/github` | Read-only repository sync and requirement reference linking |
| `/reports` | Persisted project reports and CSV export |
| `/automation` | Manual quality-rule configuration and run history |
| Any unmatched path | Not-found page |

## Final implementation summary

| Module | Previous state | Changes in this implementation | Final status |
|---|---|---|---|
| Dashboard | Basic project/requirement view | Persisted requirement, test/run, defect, status, and activity metrics | Implemented for current data; filters and trend charts remain open |
| Requirements | Manual create/list/review | Expanded categories/states, description/assignment/verification/tags, source extraction and provenance, versioned edits and deletes, transactional audit history, inline editing, configurable columns, generalized bulk operations | Core workflows tested; OCR and Excel/PDF exports remain open |
| Projects and workspaces | Project create/list and per-project membership | Workspace/team membership model and boundaries; project update/archive/restore/duplicate/delete; project metadata and workspace selection | API workflows and access isolation tested; workspace member UI and project detail tabs remain open |
| AI Intelligence | No provider analysis | Structured analysis, stored history, fallback, criteria recommendations, reviewable test suggestions | Fallback/schema tested; live provider and broader AI checks unverified |
| Traceability | Requirement-only links | Matrix includes linked tests, latest runs, defects, GitHub references, relationship/test coverage | Implemented/tested; design and task refs absent |
| Test Management | No persisted cases | Case CRUD, AI suggestions, manual execution history | Core API tested; suites, assignment, automation remain open |
| GitHub | No integration | Server-side token, manual read-only import and requirement links | Mock tested; live account, OAuth, webhooks unverified/absent |
| AI Assistant | No grounded assistant | Project-record retrieval, citations, stored conversations, local fallback | API fallback/history/scoping tested; live provider and streaming incomplete |
| Authentication and access | No accounts or API authorization | PBKDF2 accounts, signed expiring tokens, system Admin roles, workspace Owner/Admin/Editor/Viewer roles, scoped project and record routes, password change/recovery, immediate token revocation, actor-attributed audit, shared Redis rate limits | Core policies and recovery paths have automated coverage. External identity, account lifecycle UI, and live deployment validation remain open |

This summary does not imply production readiness. The security and verification
gates below still apply.

## Risks and release boundary

1. The hosted API URL currently returns HTTP 500. The exact Vercel startup
   error is unknown because project logs and environment settings were not
   accessible. Verify the Vercel project Root Directory (`backend`) and required
   PostgreSQL/TLS, bootstrap auth, HTTPS origins/CORS, TLS Redis, and TLS SMTP
   variables before changing application security policy.
2. Oracle connectivity and schema upgrades were not exercised against a live
   Oracle instance in this environment. `python-oracledb` Thin mode supports
   newer Oracle versions; Oracle 11g requires a compatible Instant Client and
   Thick mode.
3. No AI or GitHub secret is present for live provider tests. Mocked/fallback
   tests do not prove live credentials, quotas, account permissions, or
   provider compatibility.
4. Full traceability is not available for design components or development
   tasks. Test suites, broader defect workflows, OCR, PDF/XLSX exports, and
   automation scheduling remain incomplete.
5. The desktop packaging build produced a local NSIS installer, but
   installation, upgrade, persistence retention, signing, and uninstall
   behavior need a clean Windows machine test.

The current open security/deployment work is **verification and operational
access**, not the earlier unimplemented-auth baseline: the source contains
workspace scoping, account recovery, shared rate limiting, and fail-closed
public deployment validation. The registered-route sweep proves authentication
is required; it is not a substitute for a dedicated positive/negative
authorization matrix for every route and role.

## Verification record

Current audit run (2026-11-25):

- Backend: 48 passed, one Starlette/httpx deprecation warning.
- Authorization follow-up: cross-workspace probes for 19 project and
  project-owned read/write routes passed (including rejection after membership
  only in a different workspace).
- `npm exec tsc -- --noEmit`: passed; `npm run build`: passed.
- `npm run desktop:build`: completed without captured console output in this
  shell, but the NSIS installer is present (30,297,675 bytes).
- Live `https://backend-iota-blue-41.vercel.app/api/v1/health`: HTTP 500
  `FUNCTION_INVOCATION_FAILED`; Vercel logs required interactive sign-in.
- Working tree was clean before this audit; no Vercel project link/config was
  present in the checkout.

Historical verification for the 2026-11-25 workspace, lifecycle, and
requirement workflow update:

- Backend suite: 37 passed, with one Starlette/httpx deprecation warning.
- `npm exec tsc -- --noEmit` and `npm run build` passed.
- SQLite Alembic upgrade/preservation, project lifecycle, workspace authorization,
  requirement fields/status/version, bulk mutation, source extraction, and
  transactional audit/version behavior are covered by isolated tests.
- PostgreSQL offline generation completes; no live PostgreSQL or Oracle database
  was available to execute revision `20261124_0014`.

For the 2026-11-20 audit slice:

- Manual browser smoke check rendered all 15 application routes plus an
  unmatched route; no browser console errors were observed.
- `npm exec tsc -- --noEmit` and `npm run build` passed.
- `npm audit --omit=dev` reported zero vulnerabilities; `pip check` reported no
  broken requirements.
- Backend suite: 21 passed, with one Starlette/httpx deprecation warning.
- The knowledge graph is still a first pass: it does not yet model design,
  task, objective, evidence, risk, document, or decision nodes, and it has no
  automated UI coverage.
- Hosting account lookup did not respond; no domain or deployment target was
  identified. No production deployment was performed.

For the latest authenticated API milestone, verification ran:

- `npm exec tsc -- --noEmit` — passed.
- `backend/.venv/Scripts/python.exe -m pytest tests -q` — 20 passed, one
  Starlette/httpx deprecation warning.
- `npm run desktop:build` — passed; generated a 28.89 MiB Windows NSIS
  installer and bundled API sidecar.
- Packaged-sidecar smoke coverage runs in the backend suite; suite passed after
  packaging as well.

These checks do not substitute for live Oracle/provider testing, browser E2E,
accessibility review, or clean-machine installation.
