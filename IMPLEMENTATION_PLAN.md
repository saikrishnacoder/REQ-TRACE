# ReqTrace AI implementation plan

This plan follows the user's attached ReqTrace requirements specification and
the shared **Complete Project Setup Guide** conversation. The shared guide's
PostgreSQL choice is superseded by the user's Oracle requirement. Its offline +
team operation, desktop-first interface, staged delivery, and separation of
local and shared storage remain the product direction.

## Target architecture

- **Desktop:** Tauri 2 shell around React + TypeScript.
- **Local API:** Python + FastAPI sidecar bound to loopback.
- **Offline data:** SQLite under the user's application data directory; the
  browser keeps a recovery cache and retry queue.
- **Shared data:** Oracle Database through the same API contract on a separate
  authenticated team service. Desktop clients will sync through that API; they
  will never connect directly to the shared database.
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

## Current build boundary

The React intake/review flow and Oracle schema already exist. This iteration
adds durable local SQLite storage, a transactional sync outbox, an Oracle
database mode, and the Tauri/PyInstaller packaging foundation. Oracle server
mode is available for database development, but remote synchronization,
authentication, multi-user authorization, document parsing, and AI extraction
are not yet enabled. No network service is exposed without those protections.

## Audit and hardening update (2026-11-17)

See [`AUDIT_REPORT.md`](AUDIT_REPORT.md) for the repository-wide baseline and
route inventory. The first follow-up slices add non-destructive Alembic
bootstrap/upgrade support, a soft-delete migration with retained audit history,
priority filtering, sorting, pagination, CSV export, a dark navy/violet theme,
an explicit not-found page, and visible storage/sync errors. A persisted
requirement-to-requirement traceability module now creates/removes links,
records link audit events, and reports linked/orphan requirements. API,
migration, and packaged-sidecar checks cover these workflows. AI, GitHub,
test/defect management, full multi-entity traceability, reports, and automation
remain future phases; see the audit report for sequencing and boundaries.

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
grounded assistant conversations, streamed responses, and acceptance/rejection
of all suggestion types are still planned.

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
