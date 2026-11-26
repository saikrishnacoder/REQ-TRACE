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
  persisted, approval-gated Application Blueprint workflow. Project-scoped
  DRF endpoints now cover requirements/version history, source documents,
  design versions, business/audience records, test suites/cases/executions,
  traceability relationships and approval decisions.
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
- Engineering API routes share workspace scoping, role checks, activity events,
  request validation, search/filtering, and 25-row pagination (maximum 100).
  OpenAPI derives request/response schemas from DRF serializers. Approved
  requirement IDs could not be attached to the endpoint docs because the local
  project database currently contains no approved requirements or API spec.
- Application blueprints include project overview, role matrix, feature and
  requirement breakdown, page/journey/navigation/component/backend/database/
  API inventories, security/performance/integration sections, development
  dependency mapping, implementation order, clarification questions and
  requirement traceability. Drafts snapshot approved inputs. Pending drafts
  are editable while source IDs/checksums remain server-managed. Owners/Admins
  must resolve each question or mark it not applicable with a reason before
  approval. An approved, unchanged plan now produces a download-only React and
  Django starter ZIP with separate development/production settings, MySQL
  production configuration, and embedded blueprint traceability. The archive
  endpoint never writes over a user's files. Generated plans are deterministic
  proposals, not live-provider AI analysis.
- Current verification: Django tests **30 passed**; Vitest **5 passed**;
  TypeScript, Vite production build, migration drift check and OpenAPI schema
  validation passed. Live Vite root and API-proxy health requests returned
  HTTP 200.
- Backend tests ran on Python 3.13 because an accessible Python 3.12 runtime was
  unavailable. MySQL connectivity/migrations and a production deployment remain
  unverified.

## Missing product capabilities

1. Frontend screens for the newly implemented requirement/design/document,
   business/audience, test, traceability and approval APIs. Approved SRS
   snapshots can only be linked when a corresponding document approval exists.
2. PDF/DOCX extraction, queued document processing, and provider-backed
   blueprint analysis with validated outputs and citations;
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
- Requirement and design API operations exist, but users still cannot create
  or approve those inputs through the SpecForge portal; blueprint generation
  therefore depends on approved records supplied through the API or another
  trusted workflow.
- Scaffolding is available as a ZIP API download; there is no portal button or
  automatic filesystem extraction. The archive is a runnable foundation, not
  generated project-specific CRUD or business logic.
- Docker/MySQL is unavailable in this environment; database connectivity and
  migrations were verified against local SQLite only.
- MySQL adapter configuration has not been exercised against a real MySQL
  server; current tests use SQLite.
