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
5. **Documents and requirements:** implement file validation/storage,
   provenance-aware extraction, requirement CRUD, versions, evidence and
   quality findings. Begin here next; these authoring and approval workflows
   are needed to supply blueprint inputs in-product.
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

- Django test suite: **25 passed** (includes Application Blueprint traceability,
  edit, clarification and approval-gate cases).
- Frontend Vitest: **5 passed** (includes project blueprint readiness/create UI).
- TypeScript validation and Vite production build: passed.
- Django system check, migration drift check and OpenAPI validation: passed.
- MySQL connectivity, production deployment, Python 3.12 execution and
  browser-level E2E: not verified in this environment.
- Browser bearer tokens are currently in `sessionStorage`; this is not the
  final production session design.
