# SpecForge AI

SpecForge AI is a browser-based requirements engineering workspace. The
frontend is React, TypeScript, Vite, Tailwind CSS, React Router and TanStack
Query. The backend is a Django REST API with Django ORM and MySQL for hosted
data. SQLite is used only for local development and tests.

The current working slice supports account registration and login, workspace
creation and membership management, project CRUD and lifecycle controls,
project activity, project-scoped engineering APIs, and an approval-gated Application Blueprint workflow. The
blueprint uses approved requirement/design records, validated personas,
approved business analysis, and explicitly approved SRS documents. Its source
IDs and document checksums are persisted for traceability. Missing information
appears as clarification questions; an Owner/Admin cannot approve for
scaffolding while a question is unresolved.

The Django API now exposes CRUD and workflow endpoints for requirements and
versions, source documents, versioned design artifacts, business analysis and
objectives, stakeholders and personas, test suites/cases/executions,
traceability links, and approvals. These endpoints are documented in OpenAPI;
the portal screens for authoring and reviewing these records are not yet wired.
PDF/DOCX files are stored but extraction is not implemented; UTF-8 TXT/Markdown
files are extracted synchronously with a 1 MB text limit.

The frontend authoring/review screens, PDF/DOCX extraction, and provider-backed
AI analysis of source documents remain planned. The blueprint builder is
currently deterministic and does not claim that a live AI provider analyzed
project inputs.

## Local development

1. Install Node.js/npm and Python 3.12. Docker is needed only for local MySQL.
2. Install the frontend dependencies and start Vite:

   ```powershell
   npm install
   npm run dev
   ```

3. In `web_backend`, create a Python environment and install the API
   dependencies:

   ```powershell
   py -3.12 -m venv .venv
   .venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   Copy-Item .env.example .env
   docker compose up -d mysql
   python manage.py migrate
   python manage.py runserver 127.0.0.1:9000
   ```

4. Open the Vite site at `http://127.0.0.1:3000`. Vite proxies `/api/*` to the
   Django development server. OpenAPI JSON, Swagger UI and ReDoc are at
   `/api/schema/`, `/api/docs/` and `/api/redoc/` on port 9000.

For SQLite-only development, skip Docker and leave `SPECFORGE_DATABASE_URL`
unset. Django creates `web_backend/.local.sqlite3`. Production refuses SQLite.

## Configuration and deployment

The frontend uses `VITE_DJANGO_API_URL` for the public API base, ending in
`/api/v1`. The Django API uses the environment values in
[`web_backend/.env.example`](web_backend/.env.example). Production requires a
hosted MySQL database with TLS, a strong Django secret, explicit hostnames, and
HTTPS CORS/CSRF origins. Never put backend secrets in `VITE_*` variables.

Vercel configuration serves the frontend SPA. Deploy Django separately on a
Python host with persistent media storage and run migrations as a release step.
No production MySQL connection has been verified in this environment yet.

## Verification

From the repository root:

```powershell
npm test
npm exec tsc -- --noEmit
npm run build
```

From `web_backend`:

```powershell
python manage.py check
python manage.py test
python manage.py spectacular --validate --file schema-openapi.yml
```

See [AUDIT_REPORT.md](AUDIT_REPORT.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md),
and [SECURITY_AUTHORIZATION.md](SECURITY_AUTHORIZATION.md) for verified scope,
planned work, and current access rules.
