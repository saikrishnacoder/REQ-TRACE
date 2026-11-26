# SpecForge Django web API

This is the SpecForge REST API. The repository is browser-first and uses this
Django service as its product backend.

## Requirements and local setup

Use Python 3.12 or newer within the Django-supported range for the pinned
Django release. From this directory:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

The Django development default uses a local SQLite file when
`SPECFORGE_DATABASE_URL` is absent. Production refuses that fallback and
requires a MySQL URL and trusted CA certificate (`MYSQL_SSL_CA`). Production
also requires a non-debug setting, strong secret, explicit allowed hosts, and
HTTPS CORS/CSRF origins. To run MySQL locally, set `MYSQL_PASSWORD` and
`MYSQL_ROOT_PASSWORD` in `.env`, then run `docker compose up -d mysql`. Update
`SPECFORGE_DATABASE_URL` in `.env` with the same application password.

## Migrations, API, and tests

```powershell
python manage.py makemigrations
python manage.py migrate
python manage.py check
python manage.py test
python manage.py runserver 127.0.0.1:9000
```

Application-generation jobs are queued in the database. Start a worker in a
separate process with `python manage.py run_application_generation_worker`.
The worker requires server-side `LLM_API_KEY` and `LLM_MODEL` values (optional
`LLM_BASE_URL` for an OpenAI-compatible host). Generated files remain reviewable
proposals; the service never executes them. ZIP export is blocked until an
Owner/Admin approves every generated file.

- Health/readiness: `GET http://127.0.0.1:9000/api/v1/health/`
- OpenAPI JSON: `http://127.0.0.1:9000/api/schema/`
- Swagger UI: `http://127.0.0.1:9000/api/docs/`
- ReDoc: `http://127.0.0.1:9000/api/redoc/`

For the Vite development server, `/api/v1/...` is proxied to this API.
For a hosted frontend set the public `VITE_DJANGO_API_URL` to the API base ending
in `/api/v1`; it contains no credentials. Keep `DJANGO_SECRET_KEY`, database
credentials, and TLS materials on the backend host only.

The schema creates indexed project/workspace, document, requirement, business,
persona, AI-run, design, testing, traceability, approval, activity and application
generation records.
Project-scoped API collections live at `/api/v1/projects/{project_id}/`:
`requirements/`, `documents/`, `design-artifacts/`, `business-analyses/`,
`business-objectives/`, `stakeholders/`, `personas/`, `test-suites/`,
`test-cases/`, `test-executions/`, `traceability-links/`, and `approvals/`.
List responses use `{count, next, previous, results}` and support page-number
pagination. These routes require a bearer session and enforce workspace roles.
Registration, login, workspace/project lifecycle and activity APIs are
implemented. Application Blueprint readiness, approved-source snapshots,
editable persisted drafts, requirement traceability, clarification questions,
Owner/Admin approval and the scaffolding gate are implemented. The blueprint
is currently assembled deterministically; no live LLM analysis is claimed.
The separate code proposal worker is optional and requires server-side provider
configuration. Generated files are never executed.

`POST /api/v1/generation/plans/{plan_id}/scaffold/` downloads a runnable
React/Vite and Django REST Framework starter ZIP after Owner/Admin blueprint
approval, with no unresolved clarifications, and while its approved inputs
remain unchanged. It logs the actor and file count and never writes into an
existing project directory. The generated README contains independent frontend
and backend startup instructions. Development defaults to SQLite; production
settings require a MySQL URL, HTTPS origins, explicit hosts, a strong secret,
and a trusted MySQL CA certificate.

Approved SRS documents use an `Approval` record with `artefact_type` set to
`SourceDocument`, the document UUID, and version `1`; only extracted-ready,
approved documents are snapshotted. Frontend authoring/review screens, PDF/DOCX
extraction, password recovery, invitations, and production media storage remain
planned. The API docs note that requirement IDs cannot yet be mapped because
the local database contains no approved requirement records.
