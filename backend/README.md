# ReqTrace Python API

FastAPI is the local desktop API and the intended server API. SQLAlchemy
supports SQLite for the offline workspace and Oracle through `python-oracledb`.
See the repository [audit report](../AUDIT_REPORT.md) for tested modules and
known limitations.

## Local/offline database

`DATABASE_MODE=local` is the default. On Windows, the API stores SQLite at
`%LOCALAPPDATA%\ReqTrace\data\reqtrace.db`; set `REQTRACE_DATA_DIR` to move
the data directory. Local startup applies pending Alembic migrations. The
browser also retains a recovery cache and retry outbox for API interruptions.

## Install and run locally

From this `backend` directory, use Python 3.13:

```powershell
py -3.13 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Install developer dependencies and run API/migration/sidecar tests:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q tests
```

API docs: `http://127.0.0.1:8000/api/docs`.

## Oracle configuration

Set `DATABASE_MODE=oracle` and configure `ORACLE_USER`, `ORACLE_PASSWORD`,
`ORACLE_HOST`, `ORACLE_PORT`, and `ORACLE_SERVICE` in the environment or the
ignored `backend/.env`. The schema account can be created with
[`sql/create_app_user.sql`](sql/create_app_user.sql); initialize/upgrade with
`python -m app.init_db`. Migrations are in `alembic/` and preserve existing
tables through the initial `checkfirst` migration.

`python-oracledb` is the supported successor to `cx_Oracle`. Oracle 12.1+
supports Thin mode. Oracle 11g requires a compatible Instant Client and
`ORACLE_CLIENT_LIB_DIR` to enable Thick mode. A live Oracle upgrade has not
been verified in this workspace.

## Optional integrations

Set `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` for OpenAI-compatible AI
analysis and assistant responses. Without a configured/available provider,
the API uses a clearly labeled local heuristic/search fallback.

Set `GITHUB_TOKEN` for manual read-only repository sync. The token remains
server-side. Imports currently cap each category at the first 100 records;
OAuth, webhooks, and automated synchronization are not implemented.

## Security and deployment

The packaged desktop sidecar binds to loopback. **Authentication, role-based
authorization, rate limiting, and shared-team sync are not implemented. Do not
bind this API to a public or shared network, and do not expose Oracle mode as a
team service.** Keep `.env` out of source control and use a secret manager for
any future deployment. The current app has no file-upload endpoint; document
intake records a reference and user-entered text only.
