# ReqTrace AI

ReqTrace AI is being built as an offline-first Windows desktop application for
individuals and teams. The client is React + TypeScript in a Tauri 2 shell. A
local Python + FastAPI sidecar owns the per-user SQLite workspace, so records
persist when the app closes and work without a network connection. A separate
Oracle-backed FastAPI deployment will become the shared team data service.

The current implementation starts that foundation with project and requirement
intake, human review, persistent local SQLite storage, and an Oracle database
adapter. Team authentication and client-to-server synchronization are next; the
local API is loopback-only until those access controls exist.

## Start development

1. Follow [backend setup](backend/README.md) to create a Python virtual
   environment and start the local API.
2. Run `npm run dev` from this folder for the browser preview, or
   `npm run desktop:dev` for the Tauri window once Rust, the MSVC C++ build
   tools, and WebView2 are installed. The desktop command starts the local
   Python API and Vite together.
3. API documentation is at `http://127.0.0.1:8000/api/docs`.

`npm run desktop:build` packages the FastAPI sidecar with PyInstaller and then
builds the Windows installer. It writes the installer under `src-tauri/target`;
the bundled local database stays in the user's Windows application data folder.

The product scope and delivery sequence are in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

The latest source review is recorded in [AUDIT_REPORT.md](AUDIT_REPORT.md).
Run backend checks from `backend`:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q tests
```

The packaged sidecar smoke check runs when `desktop:build` has generated the
Windows sidecar.
