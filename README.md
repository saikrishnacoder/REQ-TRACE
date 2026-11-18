# ReqTrace AI

ReqTrace AI is an offline-first requirement traceability and software testing
workspace. The Windows desktop app uses React + TypeScript in Tauri 2 and a
Python + FastAPI sidecar. The local API persists to SQLite; Oracle is supported
by the same SQLAlchemy/Alembic backend for development and future team hosting.

Current routes cover projects, requirements and review, test cases and manual
runs, defects, AI analysis, grounded project Q&A, read-only GitHub imports,
traceability, reports, and manual quality automation. See
[the audit and status report](AUDIT_REPORT.md) for tested scope and remaining
work, and [the implementation plan](IMPLEMENTATION_PLAN.md) for architecture.

## Development setup

1. Install Node.js/npm, Python 3.13, Rust with the MSVC C++ build tools, and
   WebView2 for Windows desktop development.
2. Follow [backend setup](backend/README.md) to create a Python environment and
   start the API.
3. From the repository root, run `npm install`, then `npm run dev` for the
   browser preview or `npm run desktop:dev` for Tauri.
4. API docs are available at `http://127.0.0.1:8000/api/docs` while the local
   API is running.

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

The local API defaults to loopback. Authentication, RBAC, and rate limiting
have not been implemented. **Do not expose this API or Oracle mode on a
network.** AI and GitHub credentials belong only in the backend environment;
never put them in frontend configuration or source control. Oracle adapter
support does not by itself provide a production-ready team service.
