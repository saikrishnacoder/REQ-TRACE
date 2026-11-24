# ReqTrace AI technical audit and implementation report

Audit refreshed: 2026-11-24. This report reflects the current repository, not
the original baseline. Feature claims below are limited to checked-in source
and automated checks. External providers and a clean-machine install have not
been verified unless explicitly stated.

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
| Navigation and routes | Overview, projects, requirements, intake, project settings/access, traceability, tests, defects, AI, assistant, GitHub, reports, automation, and not-found route | Routes are implemented in `src/App.tsx`; automated browser route/form coverage is absent. Authentication appears as a sign-in gate rather than a URL route; global account lifecycle has no dedicated page. |
| Dashboard | Project and requirement KPIs, test/run/defect metrics, status distribution, recent audit activity, refresh | Uses persisted API data. Date filters, trend charts, and a richer activity feed remain open. |
| Requirements | CRUD/review, soft delete, filtering, sorting, pagination, CSV import/export, bulk priority, history, comments, R-R relationships | Persisted API behavior is tested. Excel/PDF export, tags, assignment, and generalized bulk editing remain open. Document intake stores a source reference and manually entered text; it does not parse or upload the selected file. |
| AI intelligence | Structured requirement analysis, history, heuristic fallback, criteria recommendations, reviewable test suggestions | Fallback/schema behavior is tested. Live provider behavior needs credentials and has not been verified. Duplicate/contradiction analysis across the corpus and accept/reject/edit for all suggestion types remain open. |
| Traceability | Requirement relationship links, test cases, latest runs, defects, GitHub requirement references, orphan/test coverage, failed case metrics | API and UI matrix implemented. A knowledge graph now renders persisted requirement, test, defect, and linked GitHub records with search, type filters, zoom, and record details. Design components and development task references are not modeled; graph pan/drag, path highlighting, export, and minimap remain open. |
| Test management | Manual case CRUD, requirement links, ordered steps, AI suggestions, execution status/history | API checks cover cases, runs, and suggestion persistence behavior. Test suites, assignment, priorities/types, attachments, and automated execution remain open. |
| Defects | Creation, severity/status, requirement and case links | Core API behavior tested. Assignment, comments, reproduction fields, attachments, and full resolution history remain open. |
| GitHub | Server token configuration, manual read-only import of repository metadata/issues/PRs/commits/branches, requirement links | Mocked provider path and token non-disclosure tested. Live account access is unverified. OAuth, webhook, pagination beyond the first 100 items per endpoint, and token vaulting are absent. |
| Assistant | Project-scoped stored conversations, retrieval from project records, cited sources, local fallback | API tests cover fallback/history/scoping. Live AI calls, streaming, regenerate, copy, and richer context selection are unverified or absent. |
| Reports | Persisted requirement, test execution, and defect views; CSV export | CSV path is implemented. PDF/XLSX, AI analysis report, filters, and scheduled reports remain open. |
| Automation | Enable/disable and manually run three read-only quality rules with stored results | API behavior tested. Schedules, notifications, actor permissions, and background triggers remain open. |
| Database and migrations | Project/domain schema, foreign keys and indexes, Alembic revisions, local SQLite plus PostgreSQL and Oracle adapters | SQLite migrations pass; PostgreSQL DDL and offline migration SQL compile. Live PostgreSQL/Oracle upgrades, rollback, and backup/restore remain unverified. |
| UI/UX | Dark navy/violet styling, responsive breakpoints, shared controls, empty/error states, sidebar and breadcrumb | Desktop build passes. Formal accessibility, keyboard/focus behavior, visual browser checks at target breakpoints, and reusable toast/skeleton/tooltip components remain incomplete. |
| Security | Loopback sidecar default, server-side secrets, parameterized SQLAlchemy, React escaping, input schemas, audit events; signed-token auth, account and project-member APIs, route-based membership guards, role checks, in-process request limits, current-account token checks, configurable CORS origins | PostgreSQL and Oracle modes require bearer auth. Admin can assign Editor/Viewer membership; non-admin project lists and project/record routes are membership-scoped. Deactivation and role changes now affect existing tokens immediately. Password reset, distributed rate limiting, exhaustive route-family authorization tests, organization tenancy, CSRF (cookie mode), and deployment hardening remain open. **Do not expose the API or database service publicly.** No upload endpoint exists. Local browser/SQLite data is not encrypted. |
| Performance and operations | Project-scoped APIs and persistent local storage | Some routes load complete project collections; large-scale pagination/index review, structured logs, request IDs, and operational monitoring remain open. |
| Automated quality | Backend pytest suite, TypeScript check, desktop installer build and sidecar smoke test | 29 backend tests pass after Phase 01; `tsc --noEmit` and Vite production build pass. PostgreSQL Alembic offline SQL compilation passes without duplicate table creation. The 2026-11-20 audit recorded zero production npm vulnerabilities and a manual route smoke check. One Starlette/httpx deprecation warning remains. No repeat desktop packaging after the current changes, frontend automated E2E suite, live PostgreSQL server test, or clean-machine installer verification. |

## Route inventory

| Path | Behavior |
|---|---|
| `/` | Persisted workspace overview |
| `/projects`, `/new-project` | Project list/switching and creation |
| `/requirements` | Search, filter, sort, page, import/export, bulk priority, edit/review/history/comments |
| `/intake` | Manual, conversation, and document-referenced text intake; document parsing is not implemented |
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
| Requirements | Manual create/list/review | CRUD/review, filters/sort/paging, CSV import/export, bulk priority, versions, comments, R-R links | Core workflows tested; Excel/PDF, tags, assignment remain open |
| AI Intelligence | No provider analysis | Structured analysis, stored history, fallback, criteria recommendations, reviewable test suggestions | Fallback/schema tested; live provider and broader AI checks unverified |
| Traceability | Requirement-only links | Matrix includes linked tests, latest runs, defects, GitHub references, relationship/test coverage | Implemented/tested; design and task refs absent |
| Test Management | No persisted cases | Case CRUD, AI suggestions, manual execution history | Core API tested; suites, assignment, automation remain open |
| GitHub | No integration | Server-side token, manual read-only import and requirement links | Mock tested; live account, OAuth, webhooks unverified/absent |
| AI Assistant | No grounded assistant | Project-record retrieval, citations, stored conversations, local fallback | API fallback/history/scoping tested; live provider and streaming incomplete |
| Authentication and access | No accounts or API authorization | PBKDF2 accounts, signed expiring tokens, Admin/Editor/Viewer roles, per-project Editor/Viewer membership, filtered project lists and record-route checks; project settings can create accounts and manage membership | Core boundaries tested; global account lifecycle UI, password reset, immediate revocation, exhaustive endpoint audit, and deployment hardening remain open |

This summary does not imply production readiness. The security and verification
gates below still apply.

## Risks and release boundary

1. The largest release blocker is incomplete authorization and deployment
   security. Oracle mode requires signed bearer tokens and now has project
   membership guards, but global account lifecycle remains API-only and the
   full route matrix still needs a dedicated security review. Add password recovery,
   distributed request limits, organization
   tenancy, and deployment hardening before shared hosting.
2. Oracle connectivity and schema upgrades were not exercised against a live
   Oracle instance in this environment. `python-oracledb` Thin mode supports
   newer Oracle versions; Oracle 11g requires a compatible Instant Client and
   Thick mode.
3. No AI or GitHub secret is present for live provider tests. Mocked/fallback
   tests do not prove live credentials, quotas, account permissions, or
   provider compatibility.
4. Full traceability is not available for design components or development
   tasks. Test suites, user assignment, broader defect workflows, PDF/XLSX,
   automation scheduling, and file parsing remain incomplete.
5. The desktop packaging build passed locally, but installation, upgrade,
   persistence retention, signing, and uninstall behavior need a clean Windows
   machine test.

## Verification record

For the 2026-11-24 Phase 01 update:

- Backend suite: 29 passed, with one Starlette/httpx deprecation warning.
- `npm exec tsc -- --noEmit`, `npm run build`, `pip check`, and Python
  compilation passed.
- PostgreSQL adapter URL selection and all mapped table DDL compile locally.
  Alembic generated offline PostgreSQL SQL through revision `20261118_0012`
  (20 unique tables). A live PostgreSQL server was not available, so this does not
  verify a network connection or execute schema changes in PostgreSQL.
- The project create/list/detail API workflow is tested against an isolated
  SQLite database and read back through a fresh SQLAlchemy session.

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
