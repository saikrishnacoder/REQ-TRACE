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
