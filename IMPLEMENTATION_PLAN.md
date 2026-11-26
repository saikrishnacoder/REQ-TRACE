# SpecForge AI implementation plan

## Principles

- Build one browser-first SpecForge application with React + TypeScript and
  Django REST Framework.
- Use persistent MySQL in shared/production environments and migrations for
  every schema change. SQLite is local/test only.
- Keep extracted evidence and AI proposals distinguishable from confirmed
  user input. Approval is required before AI proposals become accepted facts.
- Add features in reviewable phases; test before moving on and document actual
  completion rather than model-only progress.

## Phase status and sequence

1. **Audit:** complete. Repository architecture, dependencies, workflows,
   deployment, risks, and missing capabilities are in `AUDIT_REPORT.md`.
2. **Foundation:** implemented. React/TypeScript/Vite/Tailwind, Django/DRF,
   MySQL adapter, development SQLite, modular domain apps, migrations, health,
   API errors, OpenAPI, Vite API connection and validation/tests are in place.
3. **Identity and projects:** core slice implemented. Registration/login/logout,
   12-hour revocable sessions, profile, workspace membership, project CRUD and
   lifecycle, and attributed project activity are connected to the `/specforge`
   portal. Still needed: password recovery, email invitations, shared rate
   limits, production-grade session storage, broader audit events and richer
   project forms.
4. **Application intelligence and planning:** implemented as a deterministic
   Application Blueprint proposal. It snapshots approved requirement/design
   inputs (and only explicitly approved SRS documents), produces all requested
   inventory sections and clarification questions, persists editable drafts,
   maintains server-managed traceability, and requires Owner/Admin approval
   after clarifications before scaffolding. It does not call a live AI provider.
   Phase 2 scaffolding is implemented as an authenticated download endpoint for
   an approved, unchanged blueprint. It creates a ZIP-only React/Vite and Django
   starter with SQLite development and MySQL production settings; it does not
   modify a user's filesystem or invent business behavior.
5. **Documents and requirements:** implement file validation/storage,
   provenance-aware extraction, requirement CRUD, versions, evidence and
   quality findings. Backend CRUD, requirement versioning/review, 20 MB file
   upload, TXT/Markdown extraction and source approvals are implemented; PDF/
   DOCX extraction, quality scoring and frontend authoring/review UI remain.
6. **Business/audience/design:** add evidence-aware reports, editable personas,
   design artefacts and renderable diagrams.
7. **AI orchestration:** configurable providers, structured validation,
   idempotency, prompts, cost/error tracking and approval-gated proposals.
8. **Tests/traceability/approvals:** connect approved requirements to suites,
   executions, defects and evidence; implement coverage, orphan and impact
   analysis plus approval history.
9. **Reports and release:** real-data exports, background jobs, production
   MySQL deployment/backup, security and end-to-end acceptance checks.

## Current verification

- Django test suite: **30 passed** (includes project scoping, CRUD, versions,
  approval, file upload, traceability and blueprint gate cases).
- Frontend Vitest: **5 passed** (includes project blueprint readiness/create UI).
- TypeScript validation and Vite production build: passed.
- Django system check, migration drift check and OpenAPI validation: passed.
- MySQL connectivity, production deployment, Python 3.12 execution and
  browser-level E2E: not verified in this environment.
- Generated scaffold frontend npm install/build and Django check/test passed;
  its development health endpoint returned HTTP 200. Generated production
  MySQL connectivity remains unverified.
- Browser bearer tokens are currently in `sessionStorage`; this is not the
  final production session design.
