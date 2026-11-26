# SpecForge AI repository audit

**Audit state:** SpecForge-only source cutover is complete. The root application
and tracked product code are React/Vite + Django/MySQL.

## Architecture

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router 7,
  TanStack Query 5. A Vercel SPA rewrite serves the client; `VITE_DJANGO_API_URL`
  configures the separate API origin.
- **Backend:** Python/Django 5.2, Django REST Framework 3.16, Django ORM, and
  drf-spectacular OpenAPI docs. Eleven domain apps are registered.
- **Data:** Django migrations, SQLite for local development/tests, MySQL for
  production. Docker Compose provides local MySQL. No live MySQL service is
  configured here.
- **Product flows implemented:** registration/login/logout, profile updates,
  workspace creation, existing-user membership management, project CRUD,
  archive/restore/duplicate, actor-attributed project activity, and a
  persisted, approval-gated Application Blueprint workflow.
- **Repository scope:** the root application is SpecForge. Local backend
  credentials were kept outside the repository during cleanup.

## Dependencies

Frontend runtime: React, React DOM, React Router, TanStack Query. Frontend
tooling: Vite, TypeScript, Tailwind, Vitest, Testing Library. Desktop runtime
and unused icon/concurrency packages have been removed.

Backend runtime: Django, DRF, django-cors-headers, python-dotenv,
drf-spectacular, mysqlclient. Test coverage currently uses Django's test client;
pytest-django, Playwright, AI SDKs and document extraction libraries have not
yet been added.

## Verified status

- Django models/migrations exist for accounts, workspaces, projects, documents,
  requirements and versions, business analysis, personas, AI run ledger,
  design artefacts, test suites/cases/executions, traceability, approvals, and
  project activity.
- Auth and project endpoints enforce workspace membership; tests cover account
  registration/login/session expiry/revocation, workspace roles, cross-tenant
  isolation, project lifecycle, team changes and activity attribution.
- Application blueprints include project overview, role matrix, feature and
  requirement breakdown, page/journey/navigation/component/backend/database/
  API inventories, security/performance/integration sections, development
  dependency mapping, implementation order, clarification questions and
  requirement traceability. Drafts snapshot approved inputs. Pending drafts
  are editable while source IDs/checksums remain server-managed. Owners/Admins
  must resolve each question or mark it not applicable with a reason before
  approval; code scaffolding remains behind that approval. Generated plans
  are deterministic proposals, not live-provider AI analysis.
- Current verification: Django tests **25 passed**; Vitest **5 passed**;
  TypeScript, Vite production build, migration drift check and OpenAPI schema
  validation passed. Live Vite root and API-proxy health requests returned
  HTTP 200.
- Backend tests ran on Python 3.13 because an accessible Python 3.12 runtime was
  unavailable. MySQL connectivity/migrations and a production deployment remain
  unverified.

## Missing product capabilities

1. User-facing requirement/design authoring, versioning, source ingestion and
   approval workflows. Approved SRS snapshots can only be linked when a
   corresponding document approval exists; document authoring/approval is not
   yet wired to the portal.
2. Provider-backed blueprint analysis, with validated outputs and citations;
   no live AI provider call was made for this phase.
3. Test execution/evidence, complete traceability graph, coverage and impact
   reports, exports, notifications and activity across all artefacts.
4. Password reset, email invitations, shared rate limiting, production-grade
   browser session storage and MySQL deployment verification.

## Risks

- `sessionStorage` bearer credentials are exposed to same-origin JavaScript.
  Replace with an HttpOnly/CSRF design or identity provider before deployment.
- There is no shared rate limiter, password recovery, invitation email service,
  background task queue or production media store.
- Requirement and design tables exist, but users still cannot create or approve
  those inputs through the SpecForge portal; blueprint generation therefore
  depends on approved records supplied by a separate trusted workflow.
- MySQL adapter configuration has not been exercised against a real MySQL
  server; current tests use SQLite.
