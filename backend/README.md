# ReqTrace Python API

FastAPI is the one API for the desktop client and future team service. SQLAlchemy
supports the local SQLite workspace and an Oracle-backed server deployment.

## Local/offline database

`DATABASE_MODE=local` is the default. On first start, the API creates a durable
SQLite database in `%LOCALAPPDATA%\ReqTrace\data\reqtrace.db` on Windows. Set
`REQTRACE_DATA_DIR` to move it. The desktop backend writes to this database even
when there is no network connection; the browser's local storage remains a
recovery cache if the local API is unavailable.

## Oracle database

For local Oracle XE development or the future shared server, set
`DATABASE_MODE=oracle` in `.env`, then configure the `ORACLE_*` values. The
dedicated schema user is created once from SQL*Plus using
[`sql/create_app_user.sql`](sql/create_app_user.sql), and its tables are created
with `python -m app.init_db`.

The Oracle adapter uses `python-oracledb`, the supported successor to
`cx_Oracle`. It runs in Thick mode when `ORACLE_CLIENT_LIB_DIR` is configured,
which is required for this machine's Oracle XE 11g. For Oracle Database 12.1+
the driver can use Thin mode without Oracle Client libraries.

The shared deployment is intended to use Oracle as its authoritative team
database. Desktop SQLite-to-server synchronisation, authentication, and team
authorization are subsequent milestones; this local build does not expose the
API or Oracle port to the network.

## Install and run locally

Use Python 3.13 (available on the current machine):

```powershell
py -3.13 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m app.init_db
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

API docs: `http://127.0.0.1:8000/api/docs`.

## Persistence

The desktop's local SQLite database is the offline source of truth. The React
client also keeps a browser cache and retry outbox, so the workspace remains
usable if its local Python process restarts. Oracle is reserved for the
server-side team database; the sync API and authentication are not implemented
yet, so keep all current services on loopback.
