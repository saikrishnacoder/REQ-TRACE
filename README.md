# ReqTrace AI

ReqTrace AI is an offline-first requirement traceability and software testing
workspace. The Windows desktop app uses React + TypeScript in Tauri 2 and a
Python + FastAPI sidecar. The local API persists to SQLite; PostgreSQL and
Oracle adapters are available through the same SQLAlchemy/Alembic backend.

Current routes cover projects, requirements and review, test cases and manual
runs, defects, AI analysis, grounded project Q&A, read-only GitHub imports,
traceability and its knowledge graph, reports, and manual quality automation. See
[the audit and status report](AUDIT_REPORT.md) for tested scope and remaining
work, and [the implementation plan](IMPLEMENTATION_PLAN.md) for architecture.

## Development setup

1. Install Node.js/npm, Python 3.13, Rust with the MSVC C++ build tools, and
   WebView2 for Windows desktop development.
2. Follow [backend setup](backend/README.md) to create a Python environment.
3. From the repository root, run `npm install`, then `npm run dev` for the
   browser preview or `npm run desktop:dev` for Tauri. The desktop command
   starts the local API, creates a fresh per-run authentication secret, waits
   for the API health check, and shuts the API down when Tauri exits.
4. API docs are available at `http://127.0.0.1:8000/api/docs` when running the
   API manually with `npm run api:dev` or its backend Uvicorn command.

Build the Windows installer with `npm run desktop:build`. This packages the
Python sidecar with PyInstaller and creates the NSIS installer under
`src-tauri/target/release/bundle/nsis/`. Local records are kept in
`%LOCALAPPDATA%\ReqTrace\data` by default.

## Checks

Run the backend checks from `backend` after installing `requirements-dev.txt`:

```powershell
python -m pytest -q tests
```

Run the frontend type check from the repository root:

```powershell
npm exec tsc -- --noEmit
```

## Security and deployment boundary

The local API defaults to loopback. Tauri desktop sessions generate a random
256-bit local API token and require it for every request, including health and
shutdown; it stays in process memory and is never sent to non-loopback URLs.
PostgreSQL and Oracle modes require signed bearer tokens and apply basic
Admin/Editor/Viewer write guards; manually started local development mode
remains unauthenticated by default. Admins can create/deactivate accounts and assign
Editor/Viewer project membership through the API. Project and record routes
enforce membership, and non-admin project lists are filtered. Project-level
membership management is available in Project settings. Global account
lifecycle UI, password reset, distributed rate limiting, and organization
tenancy remain incomplete. Existing API tokens now honor account deactivation
and role changes immediately. For a separate frontend origin, configure
`CORS_ALLOWED_ORIGINS` in the backend and `VITE_API_URL` at frontend build
time. **Do not expose this API or a database-backed mode on a shared network.**
Oracle mode reads persisted server records and does not automatically import
projects or queued changes from the browser cache.
AI and GitHub credentials belong only in the backend environment; never put
them in frontend configuration or source control. Database adapter support does
not by itself provide a production-ready team service.
