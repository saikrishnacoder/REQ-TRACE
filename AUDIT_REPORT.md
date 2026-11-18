# ReqTrace AI repository audit

Audit date: 2026-11-18
Scope: checked-in application source, build configuration, database models, API routes, persistence adapters, desktop sidecar, documentation, and generated desktop build artifacts. The implementation now includes automated API coverage; external Oracle, live GitHub/AI credentials, and clean-machine installer workflows remain environment-dependent.

## Executive summary

ReqTrace has grown into a functional offline-first project, requirements, testing, defect, AI, GitHub, reporting, and quality-checking application. It has a React 19 + TypeScript frontend, Tauri 2 Windows desktop wrapper, Python FastAPI sidecar, SQLAlchemy models, local SQLite persistence, an Oracle `python-oracledb` adapter, a browser cache/outbox, and NSIS packaging. Some enterprise deployment and live external-service paths remain unverified or incomplete.

The current release is centered on local project workflows. Team authentication and public deployment controls remain required before shared Oracle hosting; live external service paths require credentials and provider setup.

## What is implemented

- **Projects:** create and select project workspaces. Project data is stored in the client cache and sent to the local API when available.
- **Requirements:** create drafts from entered text, filter by status, search text, edit drafts, submit for review, approve/reject, and display original wording/source metadata. The API stores records and appends audit/outbox rows.
- **Persistence:** browser `localStorage` cache and retry outbox; the desktop API defaults to a durable per-user SQLite file. The API exposes health, project list/create, requirement list/create/update, and audit-list endpoints.
- **Oracle adapter:** SQLAlchemy is configured for Oracle through `python-oracledb`, with optional Thick-mode initialization. Oracle schema creation is an explicit `app.init_db` action; the normal server startup only auto-creates tables in local mode.
- **Desktop shell:** Tauri starts a packaged loopback API sidecar in production. The sidecar binary exists at the expected target-triple path, is ignored by Git as a generated artifact, and is referenced by `externalBin` and the shell capability. A successful NSIS installer artifact exists from 2026-11-17.
- **Responsive styling:** CSS has desktop/tablet/mobile breakpoints and reduced-motion handling. On narrow screens, the sidebar collapses to icon-only navigation.
- **Real overview metrics:** the three overview counts are computed from the current project's actual requirement records. There are no test execution, coverage, or defect metrics to report yet.

## Findings by area

| Area | Audited state | Findings / risk | Priority |
|---|---|---|---|
| Frontend architecture | React + TypeScript + Vite, React Router 7; one large `src/App.tsx` and one global CSS file | Core features are concentrated in a monolithic component. There is no component/design-token layer for the requested enterprise interface. | P2 |
| Routes and navigation | `/`, `/requirements`, `/intake`, `/project`, `/new-project` | Catch-all route renders Overview for unknown URLs, which masks route errors. No route exists for the other requested modules. Project settings is informational only. | P1 |
| Requirements | Create/list/edit, review, soft-delete, filter/sort/paginate, validated CSV import/export, comments, version history, requirement links | Bulk update and Excel import remain open. `source=Document` for general intake still records a source label and manually entered text; files are not stored or parsed. | P1 |
| Requirement review | Draft → Under review → Approved/Rejected path in UI/API | Review writes are optimistic in the client; there is no visible failure/retry detail tied to a specific record. Approved/rejected records are intentionally read-only in this phase. | P1 |
| Dashboard | Real project/requirement counts, persisted case/run/defect metrics, requirement status distribution, recent audit activity, refresh | No date filters, trend charts, or report export yet. API-backed metrics explicitly show unavailable when offline. | P2 |
| Backend/API | FastAPI + synchronous SQLAlchemy session dependencies | Eight routes total including root/health. No auth, authorization, rate limiting, request IDs, structured application logging, or explicit API error envelope. API CRUD errors can surface as generic client errors. This is safe only while bound to loopback; do not expose Oracle mode on a network without the planned access controls. | P0 for shared deployment |
| Database/schema | Four models/tables: projects, requirements, audit events, sync outbox | No users/organizations, requirement versions/dependencies/comments, AI analyses, traceability links, test suites/cases/executions, defects, GitHub records, conversations, or automation tables. `alembic` is a dependency but there is no migration environment or revision history; `create_all` does not upgrade existing schemas. SQLite foreign-key enforcement is not explicitly enabled. | P1 |
| Local cache/synchronization | localStorage recovery data plus queued POST/PATCH writes; 15-second online retry | A permanently invalid first outbox item blocks later writes because flush stops at the first error. There are no deletes/conflict-resolution policies or server-side sync API. This is single-user/local-first, not team synchronization. | P1 |
| Oracle | `oracle+oracledb`, environment-based settings, setup SQL and explicit schema initializer | No schema migrations or authenticated team API yet. The setup SQL contains a password placeholder by design; secrets must remain in ignored `.env`/environment variables. | P1 for team use |
| AI | No model/provider client or server endpoints | Requirement analysis, generation, grounded assistant, structured validation, fallback, history, and key management are absent. Current conversation intake explicitly captures text without AI. | P1 |
| GitHub | Server-side read-only token integration; manual repo sync for issues, PRs, commits, branches; persisted requirement links | No OAuth flow, webhook, write actions, or external credential verification. Sync imports first 100 records per category. | P1 |
| Traceability/testing/defects | Requirement-link matrix, test cases and manual runs, AI test suggestions, defect register | Full multi-entity graph, automated execution, suites/assignment and richer defect workflow remain open. | P1 |
| Reports/automation | No report or automation implementation | No scheduled jobs, execution history, exports, or rule controls. | P2 |
| Security/privacy | Secrets are excluded by `.gitignore`; local sidecar defaults to loopback; React escapes rendered values | No authentication/RBAC/CSRF/rate limiting or file-upload validation exists. SQLite and browser cache are not encrypted. Do not host the current API publicly or accept untrusted document uploads. | P0 for shared deployment |
| UI/UX/accessibility | Light green/white visual system; compact controls and small 8–11px text in many areas | Current palette differs from the requested charcoal/navy/violet direction. No reusable toast/skeleton/error components. Drawer lacks dialog/focus-management behavior; icon-only mobile nav lacks visible labels. Mobile is compressed navigation rather than a true expandable drawer. | P2 |
| Performance/scale | Client fetches all projects and all requirements for every project; periodic sync | Fine for a small local MVP, but unpaginated endpoints and full-record polling will not scale to a large team workspace. | P2 |
| Tests/quality | No tracked test/spec files or test runner configuration found | No automated coverage for API rules, persistence/outbox behavior, route rendering, migration upgrades, sidecar startup, or packaging. A prior frontend/Tauri/NSIS build succeeded, but this does not validate those workflows end to end. | P1 |
| Packaging/configuration | `desktop:build` bundles FastAPI with PyInstaller before `tauri build`; Tauri references the target-specific sidecar | The generated sidecar and NSIS artifact are present locally. A clean-machine install and data-retention/upgrade path have not been verified. PyInstaller rebuild and application start must be part of release verification. | P1 |

## Route inventory

| Path | Current behavior | Status |
|---|---|---|
| `/` | Project overview with counts/workflow/recent requirements | Implemented |
| `/projects` | Switch between saved workspaces and create projects | Implemented |
| `/requirements` | Search/filter/list and review drawer | Partial |
| `/intake` | Manual/conversation text capture; document metadata + manually entered text | Partial; no parser/upload/AI |
| `/project` | Read-only active project details | Partial |
| `/new-project` | Create a project | Implemented |
| `/traceability` | Requirement relationships, linked test cases and latest executions, defects, imported GitHub references, requirement-link coverage and test coverage | Implemented from project-scoped API data; code/design/task artifact types are not modeled |
| `/tests` | Create/list cases, record actual results by run status, inspect execution history | Implemented for manual execution; test suites/assignment remain outstanding |
| `/defects` | Create and list defects; change issue status | Implemented; richer editing/assignment is not yet available |
| `/ai` | Requirement analysis, saved history, clearly labeled local heuristic fallback | Implemented; live provider calls need a server-side AI key and have not been externally verified |
| `/assistant` | Saved project conversations, retrieved-record answers, and source links | Implemented with local-search fallback; live provider path needs server-side key; streaming and regenerate remain open |
| `/github` | Server-configured repository import and requirement links to issues, PRs, commits, branches | Implemented for manual read-only sync; requires `GITHUB_TOKEN`; OAuth and webhook sync remain open |
| `/reports` | Requirement progress, test execution, and defect reports with safe CSV export | Implemented; PDF/XLSX and date-filtered analytics remain open |
| `/automation` | Enable/disable and manually run read-only project quality checks with stored history | Implemented for three checks; scheduling, notifications, permissions, and background triggers remain open |
| Any other path | Dedicated not-found view with navigation back into the app | Implemented |

## No UI-only features to misrepresent

The current UI contains explicit copy that document parsing and AI are not connected, and the implementation plan says remote team sync/authentication are future work. That honesty is good and should be preserved. The document chooser does not persist its file; it preserves only a source label/reference and the user-entered text. The interface should not be described as having GitHub sync, AI extraction, tests, coverage, defects, or reports until those flows have a working API and persistence path.

## Implementation order

1. **Harden the Phase 1 core:** fix unknown-route handling, expose save/sync errors, make sidecar startup and persistence observable, and add API/frontend tests for the existing workflows.
2. **Schema evolution and requirement lifecycle:** introduce Alembic-compatible migrations without dropping current SQLite/Oracle records; add requirement deletion with confirmation, history UI, sorting/pagination, and CSV import/export with validation.
3. **Traceability domain:** add versioning, dependencies, trace links and audit history; implement orphan/coverage queries and a matrix based on persisted data.
4. **Test and defect management:** add persisted suites/cases/steps/executions/defects and requirement/test linking, then wire functional routes and history.
5. **Access-controlled team API and GitHub:** implement users/organizations/roles and secret handling before exposing remote Oracle; add OAuth/repository/reference sync with explicit success state.
6. **AI intelligence/assistant:** add provider configuration on the server, validated structured outputs, grounded context/source references, analysis history, and user-reviewed accept/reject/edit flows. AI-unavailable fallback must be testable.
7. **Dashboard, reports, automation, and visual redesign:** use real query-backed records, exports, rule execution history, reusable design tokens/components, accessibility, and mobile navigation.
8. **Release verification:** exercise routes/forms/API/migrations/persistence/sidecar/installer on clean data, run automated checks, and document credentials or external services still needed.

## Current release boundary

The app is usable as a local project/requirement intake and review prototype when its desktop sidecar is packaged and started. It is not a secure multi-user service or a complete AI/GitHub traceability product. The README and implementation plan already make this distinction; deployment must continue to respect it.

## Progress after the baseline audit

The following first-phase changes are now in the working tree:

- Unknown paths render a dedicated 404 view; the breadcrumb also reports “Not found.”
- The implemented UI now uses the charcoal/navy/violet palette, clearer text sizes, dark form controls, visible focus outlines, and named icon-only mobile links.
- Local API startup applies Alembic revisions. The bootstrap uses `checkfirst` and does not drop existing tables; revision `20261117_0002` adds the requirement soft-delete column while preserving rows.
- Requirement lists now support priority filtering, sorting, 20-row pagination, CSV export, and a delete action that removes records from active lists while retaining the record and audit event in the database.
- The `/traceability` route now persists requirement-to-requirement `depends_on`, `relates_to`, and `conflicts_with` links, rejects self/duplicate/cross-project relationships, records link changes in the audit log, and reports linked/orphan requirements. Its percentage is relationship-link coverage, not test coverage.
- Storage/API failures appear in an accessible status banner and retain the browser outbox for retry.
- `backend/tests` covers project/requirement API behavior, review state validation, unique keys, delete/audit behavior, traceability links, fresh schema creation, legacy data preservation, and the packaged-sidecar health/migration smoke check.
- Verification completed for this slice: 9 backend tests passed; TypeScript check passed; Vite production build and Windows sidecar/NSIS packaging passed with traceability included. The installer is 28.82 MiB. The test suite currently emits one Starlette/httpx deprecation warning.

Remaining gaps include AI, GitHub, full multi-entity traceability, test management, defects, team authentication, reports, and automation. Oracle schema upgrade behavior is implemented through the same Alembic environment but has not been exercised against a live Oracle server as part of this slice.

## Additional traceability progress

The traceability slice is included in the refreshed Windows installer. It has
requirement-link persistence, project matrix/link CRUD API routes,
same-project/self/duplicate validation, audit/outbox records, and linked/orphan
views. The packaged sidecar smoke check passed and left no test processes
running. Live Oracle verification and the remaining product modules are still
open work.

## Test and defect progress

Alembic revision `20261117_0004` adds persisted test cases and defects. The API
validates requirement/test references against the active project, assigns
readable IDs, records audit and outbox events, and supports defect status
changes. The `/tests` and `/defects` screens create and list those records.
Automated runs and broader multi-entity trace views remain open. Manual
execution evidence is now persisted. The refreshed installer and
packaged-sidecar smoke check passed with the test execution migration included.

## AI requirement intelligence progress

Alembic revision `20261117_0005` persists validated analysis results and
provider labels. The `/ai` route analyzes a selected requirement, shows saved
history, distinguishes AI provider output from the local heuristic fallback,
and lets the user add recommended acceptance criteria to editable requirements.
Provider configuration is server-side (`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`)
and never returned to the client. Fallback persistence and output validation
are covered by the backend suite; an external provider request has not been
verified because no provider credential was supplied in this workspace.
The test management page also generates reviewable, unsaved case suggestions
from a selected requirement. A user explicitly saves accepted cases.

## Grounded assistant progress

Alembic revision `20261117_0007` adds project conversations and message history.
The `/assistant` route retrieves requirement, case, and defect records from the
selected project, stores user/assistant messages, and returns source references
with each answer. Without a configured provider, it uses local term matching and
states that limitation. Conversation access is project-scoped. Fallback,
history, source references, and cross-project rejection pass backend tests.
External provider calls and streaming are not verified/implemented.

## GitHub integration progress

Alembic revision `20261117_0008` adds repository, imported-record, and
requirement-link tables. The `/github` route reports credential configuration,
lists repositories visible to a server-side fine-grained token, imports the
first 100 issues, pull requests, commits, and branches per category, and lets
users link imported records to requirements. Credentials never leave FastAPI.
The API tests use a mocked GitHub provider and verify token non-disclosure,
record persistence, and requirement linking. A live GitHub call has not been
verified because no token was configured. OAuth, webhooks, pagination beyond
100 per endpoint, and automatic background sync remain outstanding.
