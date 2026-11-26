"""Build a safe, deterministic React + Django starter archive from an approved blueprint."""
from __future__ import annotations

import json
import html
import re
from pathlib import PurePosixPath


def _slug(value: str, fallback: str = "application") -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(value).strip().lower()).strip("-_")
    return value[:48] or fallback


def _pascal(value: str) -> str:
    return "".join(part.capitalize() for part in re.split(r"[-_]+", _slug(value))) or "Generated"


def _json(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def build_scaffold_files(plan) -> dict[str, str]:
    """Return a complete starter file map; never writes to a caller-selected directory."""
    blueprint = plan.plan
    overview = blueprint.get("application_overview", {})
    project = plan.project
    project_value = overview.get("project")
    project_name = str(project_value.get("name") if isinstance(project_value, dict) else project_value or project.name)
    package_name = _slug(project_name)
    title = html.escape(project_name)
    requirement_ids = [item.get("requirement_id") for item in blueprint.get("requirement_traceability", []) if item.get("requirement_id")]
    traceability = {
        "generation_plan_id": str(plan.pk),
        "plan_version": plan.version,
        "source_hash": plan.source_hash,
        "requirement_ids": requirement_ids,
        "blueprint": blueprint,
    }

    files = {
        "README.md": f"""# {title}

Runnable React + TypeScript + Vite frontend and Django REST Framework backend scaffold.

## Prerequisites

- Node.js 20.19+ (or 22.12+) and npm
- Python 3.12+
- MySQL 8+ for production; local development defaults to SQLite

## Start the frontend

```sh
cd frontend
npm install
npm run dev
```

## Start the backend (separate terminal)

```sh
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

The backend health check is `http://127.0.0.1:8000/api/v1/health/`. Set
`VITE_API_URL` in `frontend/.env` to override the frontend API base URL.

## Production configuration

Set `DJANGO_SETTINGS_MODULE=config.settings.production`, `DJANGO_DEBUG=0`, a
unique `DJANGO_SECRET_KEY` (at least 40 characters), explicit `DJANGO_ALLOWED_HOSTS`,
HTTPS `DJANGO_CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS`, and a
`DATABASE_URL` using `mysql://user:password@host:3306/database`. Install a trusted
MySQL CA bundle and set `MYSQL_SSL_CA`. Apply migrations with `python manage.py migrate`.
Production settings refuse SQLite and development secrets.

This archive is a new starter project. It does not modify an existing directory;
extract it into a new, empty folder. Review `docs/blueprint-traceability.json`
before implementing project-specific behavior. Generated files are scaffolding,
not approved business logic.
""",
        ".gitignore": """# Python\n__pycache__/\n*.py[cod]\n.venv/\n.env\n*.sqlite3\nmedia/\n\n# Node\nnode_modules/\ndist/\n.vite/\n\n# Editors and OS\n.vscode/\n.idea/\n.DS_Store\nThumbs.db\n""",
        "docs/blueprint-traceability.json": _json(traceability),
        "docs/architecture.md": f"""# Application architecture\n\nProject: {title}\n\nThis baseline contains a React + TypeScript + Vite SPA, Django REST Framework API,\nDjango ORM and MySQL production adapter. Local development uses SQLite unless\n`DATABASE_URL` is set. The approved blueprint and requirement links are in\n`blueprint-traceability.json`.\n\n## Implementation sequence\n\n1. Review approved blueprint, source references and unresolved decisions.\n2. Implement data models and forward-only Django migrations.\n3. Implement authenticated API operations and workspace/project authorization.\n4. Connect frontend pages through the API service.\n5. Add tests from approved acceptance criteria before release.\n""",
        "database/README.md": """# Database\n\nDjango ORM models and forward-only migrations belong to backend apps. Local\ndevelopment may use SQLite. Production uses MySQL configured through DATABASE_URL\nand MYSQL_SSL_CA. Never commit credentials or replace an existing database; review\neach migration and back up persistent data before production migration.\n""",
        "scripts/dev.ps1": """$ErrorActionPreference = 'Stop'\nStart-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location backend; python manage.py runserver 127.0.0.1:8000'\nSet-Location frontend\nnpm run dev\n""",
        "scripts/dev.sh": """#!/usr/bin/env sh\nset -eu\n(cd backend && python manage.py runserver 127.0.0.1:8000) &\nbackend_pid=$!\ntrap 'kill "$backend_pid" 2>/dev/null || true' EXIT INT TERM\n(cd frontend && npm run dev)\n""",
        "frontend/package.json": _json({
            "name": package_name,
            "private": True,
            "version": "0.1.0",
            "type": "module",
            "scripts": {"dev": "vite --host 127.0.0.1", "build": "tsc -b && vite build", "preview": "vite preview --host 127.0.0.1"},
            "dependencies": {"@tanstack/react-query": "^5.83.0", "react": "^19.0.1", "react-dom": "^19.0.1", "react-router-dom": "^7.18.5"},
            "devDependencies": {"@tailwindcss/vite": "^4.1.11", "@types/react": "^19.3.0", "@types/react-dom": "^19.3.0", "@vitejs/plugin-react": "^6.1.1", "tailwindcss": "^4.1.11", "typescript": "^7.0.2", "vite": "^8.3.0"},
        }),
        "frontend/index.html": f"""<!doctype html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/><meta name=\"description\" content=\"{title} application\"/><title>{title}</title></head><body><div id=\"root\"></div><script type=\"module\" src=\"/src/main.tsx\"></script></body></html>\n""",
        "frontend/.env.example": "VITE_API_URL=http://127.0.0.1:8000/api/v1\n",
        "frontend/vite.config.ts": """import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport tailwindcss from '@tailwindcss/vite';\n\nexport default defineConfig({ plugins: [react(), tailwindcss()] });\n""",
        "frontend/tsconfig.json": _json({"files": [], "references": [{"path": "./tsconfig.app.json"}, {"path": "./tsconfig.node.json"}]}),
        "frontend/tsconfig.app.json": _json({"compilerOptions": {"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo", "target": "ES2022", "useDefineForClassFields": True, "lib": ["ES2022", "DOM", "DOM.Iterable"], "module": "ESNext", "skipLibCheck": True, "moduleResolution": "bundler", "allowImportingTsExtensions": True, "verbatimModuleSyntax": True, "moduleDetection": "force", "noEmit": True, "jsx": "react-jsx", "strict": True, "noUnusedLocals": True, "noUnusedParameters": True, "noFallthroughCasesInSwitch": True}}),
        "frontend/tsconfig.node.json": _json({"compilerOptions": {"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo", "target": "ES2023", "lib": ["ES2023"], "module": "ESNext", "skipLibCheck": True, "moduleResolution": "bundler", "allowImportingTsExtensions": True, "verbatimModuleSyntax": True, "moduleDetection": "force", "noEmit": True, "strict": True}, "include": ["vite.config.ts"]}),
        "frontend/src/main.tsx": """import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport { QueryClient, QueryClientProvider } from '@tanstack/react-query';\nimport { App } from './App';\nimport './styles.css';\n\nconst queryClient = new QueryClient();\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>,\n);\n""",
        "frontend/src/App.tsx": """import { BrowserRouter, Route, Routes } from 'react-router-dom';\nimport { HomePage } from './pages/HomePage';\nimport { NotFoundPage } from './pages/NotFoundPage';\nimport { AppLayout } from './layouts/AppLayout';\n\nexport function App() {\n  return <BrowserRouter><Routes><Route element={<AppLayout />}><Route index element={<HomePage />} /><Route path=\"*\" element={<NotFoundPage />} /></Route></Routes></BrowserRouter>;\n}\n""",
        "frontend/src/vite-env.d.ts": "/// <reference types=\"vite/client\" />\n",
        "frontend/src/config.ts": "export const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1').replace(/\\/$/, '');\n",
        "frontend/src/services/api.ts": """import { apiBaseUrl } from '../config';\n\nexport class ApiError extends Error {\n  constructor(message: string, readonly status?: number) { super(message); this.name = 'ApiError'; }\n}\n\nexport async function getHealth(): Promise<{ status: string; service: string }> {\n  let response: Response;\n  try { response = await fetch(`${apiBaseUrl}/health/`); }\n  catch { throw new ApiError('Backend is not reachable. Start the Django server and try again.'); }\n  if (!response.ok) throw new ApiError(`Backend returned HTTP ${response.status}.`, response.status);\n  return response.json() as Promise<{ status: string; service: string }>;\n}\n""",
        "frontend/src/hooks/useHealth.ts": """import { useQuery } from '@tanstack/react-query';\nimport { getHealth } from '../services/api';\n\nexport function useHealth() { return useQuery({ queryKey: ['health'], queryFn: getHealth, retry: 1, staleTime: 15_000 }); }\n""",
        "frontend/src/pages/HomePage.tsx": f"""import {{ useHealth }} from '../hooks/useHealth';\n\nexport function HomePage() {{\n  const health = useHealth();\n  return <main className=\"mx-auto max-w-3xl p-8\"><p className=\"text-sm font-semibold text-indigo-700\">Application scaffold</p><h1 className=\"mt-2 text-3xl font-bold\">{title}</h1><p className=\"mt-3 text-slate-600\">React, TypeScript, Vite, Django REST Framework and MySQL production support are configured.</p><section className=\"mt-8 rounded-xl border border-slate-200 bg-white p-5\" aria-live=\"polite\"><h2 className=\"font-semibold\">Backend connection</h2>{{health.isPending ? <p className=\"mt-2 text-slate-600\">Checking backend…</p> : health.isError ? <p role=\"alert\" className=\"mt-2 text-rose-700\">{{health.error.message}}</p> : <p className=\"mt-2 text-emerald-700\">{{health.data.status}} — {{health.data.service}}</p>}}</section></main>;\n}}\n""",
        "frontend/src/pages/NotFoundPage.tsx": "import { Link } from 'react-router-dom';\n\nexport function NotFoundPage() { return <main className=\"p-8\"><h1 className=\"text-2xl font-bold\">Page not found</h1><Link className=\"text-indigo-700 underline\" to=\"/\">Return home</Link></main>; }\n",
        "frontend/src/layouts/AppLayout.tsx": "import { Link, Outlet } from 'react-router-dom';\n\nexport function AppLayout() { return <div className=\"min-h-screen bg-slate-50 text-slate-900\"><header className=\"border-b border-slate-200 bg-white px-8 py-4\"><Link to=\"/\" className=\"font-semibold\">Application</Link></header><Outlet /></div>; }\n",
        "frontend/src/components/LoadingState.tsx": "export function LoadingState({ label = 'Loading…' }: { label?: string }) { return <p role=\"status\" aria-live=\"polite\">{label}</p>; }\n",
        "frontend/src/contexts/AppContext.tsx": "import { createContext } from 'react';\n\nexport const AppContext = createContext<Record<string, never>>({});\n",
        "frontend/src/types/api.ts": "export type ApiHealth = { status: string; service: string };\n",
        "frontend/src/utils/format.ts": "export function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)); }\n",
        "frontend/src/styles.css": "@import 'tailwindcss';\n\n:root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-synthesis: none; text-rendering: optimizeLegibility; }\nbody { margin: 0; min-width: 320px; min-height: 100vh; }\n",
        "frontend/src/assets/.gitkeep": "",
        "backend/requirements.txt": "Django>=5.2,<6.0\ndjangorestframework>=3.16,<4.0\ndjango-cors-headers>=4.7,<5.0\npython-dotenv>=1.0,<2.0\nmysqlclient>=2.2.7,<3.0\n",
        "backend/.env.example": "DJANGO_SETTINGS_MODULE=config.settings.development\nDJANGO_DEBUG=1\nDJANGO_SECRET_KEY=replace-this-development-only-secret\nDJANGO_ALLOWED_HOSTS=localhost,127.0.0.1\nDJANGO_CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173\nDATABASE_URL=\nMYSQL_SSL_CA=\n",
        "backend/manage.py": """#!/usr/bin/env python\nimport os\nimport sys\n\nif __name__ == '__main__':\n    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n""",
        "backend/config/__init__.py": "",
        "backend/config/settings/__init__.py": "",
        "backend/config/settings/base.py": """import os\nfrom pathlib import Path\nfrom urllib.parse import unquote, urlsplit\nfrom django.core.exceptions import ImproperlyConfigured\nfrom dotenv import load_dotenv\n\nBASE_DIR = Path(__file__).resolve().parents[2]\nload_dotenv(BASE_DIR / '.env')\nSECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'development-only-change-this-secret')\nDEBUG = os.environ.get('DJANGO_DEBUG', '1').lower() in {'1', 'true', 'yes'}\nALLOWED_HOSTS = [item.strip() for item in os.environ.get('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost,testserver').split(',') if item.strip()]\nCORS_ALLOWED_ORIGINS = [item.strip() for item in os.environ.get('DJANGO_CORS_ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(',') if item.strip()]\nINSTALLED_APPS = ['django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles', 'corsheaders', 'rest_framework', 'apps.core']\nMIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'corsheaders.middleware.CorsMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware']\nROOT_URLCONF = 'config.urls'\nTEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]\nWSGI_APPLICATION = 'config.wsgi.application'\nASGI_APPLICATION = 'config.asgi.application'\nREST_FRAMEWORK = {'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny']}\n\ndef _database():\n    raw = os.environ.get('DATABASE_URL', '').strip()\n    if not raw:\n        if not DEBUG:\n            raise ImproperlyConfigured('DATABASE_URL is required outside development')\n        return {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / '.local.sqlite3'}\n    parsed = urlsplit(raw)\n    if parsed.scheme not in {'mysql', 'mysql2'} or not parsed.hostname or not parsed.path.strip('/'):\n        raise ImproperlyConfigured('DATABASE_URL must be a mysql:// URL')\n    options = {'charset': 'utf8mb4'}\n    ca_file = os.environ.get('MYSQL_SSL_CA', '').strip()\n    if ca_file:\n        options['ssl'] = {'ca': ca_file}\n    return {'ENGINE': 'django.db.backends.mysql', 'NAME': unquote(parsed.path.lstrip('/')), 'USER': unquote(parsed.username or ''), 'PASSWORD': unquote(parsed.password or ''), 'HOST': parsed.hostname, 'PORT': str(parsed.port or 3306), 'OPTIONS': options, 'CONN_MAX_AGE': 0}\n\nDATABASES = {'default': _database()}\nLANGUAGE_CODE = 'en-us'\nTIME_ZONE = 'UTC'\nUSE_I18N = True\nUSE_TZ = True\nSTATIC_URL = 'static/'\nDEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'\n""",
        "backend/config/settings/development.py": "from .base import *  # noqa: F403\n\nDEBUG = True\n",
        "backend/config/settings/production.py": """import os\nos.environ['DJANGO_DEBUG'] = '0'\nfrom .base import *  # noqa: F403,E402\nfrom django.core.exceptions import ImproperlyConfigured\n\nDEBUG = False\nif len(SECRET_KEY) < 40 or SECRET_KEY.startswith('development-only'):\n    raise ImproperlyConfigured('Set a unique DJANGO_SECRET_KEY of at least 40 characters')\nif not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS:\n    raise ImproperlyConfigured('Set explicit DJANGO_ALLOWED_HOSTS values')\nif not os.environ.get('DATABASE_URL', '').startswith(('mysql://', 'mysql2://')):\n    raise ImproperlyConfigured('Production requires a MySQL DATABASE_URL')\nif not os.environ.get('MYSQL_SSL_CA', '').strip():\n    raise ImproperlyConfigured('Set MYSQL_SSL_CA to the trusted MySQL CA bundle')\nif not CORS_ALLOWED_ORIGINS or any(not origin.startswith('https://') for origin in CORS_ALLOWED_ORIGINS):\n    raise ImproperlyConfigured('Set explicit HTTPS DJANGO_CORS_ALLOWED_ORIGINS')\nSECURE_SSL_REDIRECT = True\nSESSION_COOKIE_SECURE = True\nCSRF_COOKIE_SECURE = True\nSECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')\nSECURE_CONTENT_TYPE_NOSNIFF = True\n""",
        "backend/config/urls.py": "from django.contrib import admin\nfrom django.urls import include, path\n\nurlpatterns = [path('admin/', admin.site.urls), path('api/v1/', include('apps.core.urls'))]\n",
        "backend/config/wsgi.py": "import os\nfrom django.core.wsgi import get_wsgi_application\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')\napplication = get_wsgi_application()\n",
        "backend/config/asgi.py": "import os\nfrom django.core.asgi import get_asgi_application\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')\napplication = get_asgi_application()\n",
        "backend/apps/__init__.py": "",
        "backend/apps/core/__init__.py": "",
        "backend/apps/core/apps.py": "from django.apps import AppConfig\n\nclass CoreConfig(AppConfig):\n    default_auto_field = 'django.db.models.BigAutoField'\n    name = 'apps.core'\n",
        "backend/apps/core/models.py": "from django.db import models\n\n# Add project-specific models here, then create and review Django migrations.\n",
        "backend/apps/core/views.py": "from django.db import connection\nfrom rest_framework.permissions import AllowAny\nfrom rest_framework.response import Response\nfrom rest_framework.views import APIView\n\nclass HealthView(APIView):\n    permission_classes = [AllowAny]\n    authentication_classes = []\n\n    def get(self, request):\n        with connection.cursor() as cursor:\n            cursor.execute('SELECT 1')\n            cursor.fetchone()\n        return Response({'status': 'ok', 'service': 'application-api'})\n",
        "backend/apps/core/urls.py": "from django.urls import path\nfrom .views import HealthView\n\nurlpatterns = [path('health/', HealthView.as_view(), name='health')]\n",
        "backend/apps/core/tests.py": "from django.test import TestCase\nfrom rest_framework.test import APIClient\n\nclass HealthEndpointTests(TestCase):\n    def test_health_checks_database_and_returns_service_status(self):\n        response = APIClient().get('/api/v1/health/')\n        self.assertEqual(response.status_code, 200)\n        self.assertEqual(response.json()['status'], 'ok')\n",
        "backend/api/__init__.py": "",
        "backend/api/README.md": "Versioned API route modules can be assembled here as the approved API blueprint is implemented. The starter health endpoint is in apps/core/urls.py.\n",
        "backend/services/__init__.py": "",
        "backend/permissions/__init__.py": "",
        "backend/tests/__init__.py": "",
        "backend/tests/README.md": "Run all backend checks with `python manage.py test`. Add API and authorization tests alongside each approved operation.\n",
        "backend/.gitignore": "__pycache__/\n*.py[cod]\n.venv/\n.env\n*.sqlite3\nmedia/\nstaticfiles/\n",
    }

    structure = blueprint.get("application_structure", {})
    app_names = []
    for entry in structure.get("backend_module_inventory", []):
        raw_name = entry if isinstance(entry, str) else entry.get("name", entry.get("module", "")) if isinstance(entry, dict) else ""
        app_name = _slug(raw_name, "").replace("-", "_")
        if app_name and app_name not in {"core", *app_names}:
            app_names.append(app_name)
    app_names = app_names[:30]
    for app_name in app_names:
        class_name = _pascal(app_name)
        app_root = f"backend/apps/{app_name}"
        files.update({
            f"{app_root}/__init__.py": "",
            f"{app_root}/apps.py": f"from django.apps import AppConfig\n\nclass {class_name}Config(AppConfig):\n    default_auto_field = 'django.db.models.BigAutoField'\n    name = 'apps.{app_name}'\n",
            f"{app_root}/models.py": "from django.db import models\n\n# Add approved domain models here, then generate and review a migration.\n",
            f"{app_root}/serializers.py": "from rest_framework import serializers\n\n# Define validated serializers for approved API operations here.\n",
            f"{app_root}/views.py": "from rest_framework.views import APIView\n\n# Implement approved endpoints; API access is authenticated by default.\n",
            f"{app_root}/urls.py": "urlpatterns = []\n",
            f"{app_root}/tests.py": "from django.test import TestCase\n\n# Add tests for approved application behavior here.\n",
        })
    if app_names:
        app_config_paths = ", ".join(f"'apps.{name}.apps.{_pascal(name)}Config'" for name in app_names)
        settings_path = "backend/config/settings/base.py"
        files[settings_path] = files[settings_path].replace("'rest_framework', 'apps.core']", f"'rest_framework', 'apps.core', {app_config_paths}]")
        extra_routes = ", ".join(f"path('api/v1/{name}/', include('apps.{name}.urls'))" for name in app_names)
        urls_path = "backend/config/urls.py"
        files[urls_path] = files[urls_path].replace(
            "urlpatterns = [path('admin/', admin.site.urls), path('api/v1/', include('apps.core.urls'))]",
            f"urlpatterns = [path('admin/', admin.site.urls), path('api/v1/', include('apps.core.urls')), {extra_routes}]",
        )

    seen_pages = {"home", "not-found"}
    for item in structure.get("page_screen_inventory", [])[:50]:
        raw_title = item.get("title", item.get("name", "")) if isinstance(item, dict) else str(item)
        page_slug = _slug(raw_title, "")
        if not page_slug or page_slug in seen_pages:
            continue
        seen_pages.add(page_slug)
        component = f"{_pascal(page_slug)}Page"
        files[f"frontend/src/pages/{component}.tsx"] = f'''export function {component}() {{ return <main className="mx-auto max-w-4xl p-8"><h1 className="text-2xl font-bold">{html.escape(str(raw_title))}</h1><p className="mt-3 text-slate-600">Starter screen generated from the approved blueprint inventory. Implement its approved requirements before use.</p></main>; }}\n'''

    # Keep normal API routes private by default; the explicit health view opts out.
    files["backend/config/settings/base.py"] = files["backend/config/settings/base.py"].replace(
        "REST_FRAMEWORK = {'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.AllowAny']}",
        "REST_FRAMEWORK = {'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated']}",
    )
    production = files["backend/config/settings/production.py"]
    production = production.replace(
        "if not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS:",
        "if not os.environ.get('DJANGO_ALLOWED_HOSTS', '').strip() or not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS:",
    )
    production = production.replace(
        "if not CORS_ALLOWED_ORIGINS or any(not origin.startswith('https://') for origin in CORS_ALLOWED_ORIGINS):\n    raise ImproperlyConfigured('Set explicit HTTPS DJANGO_CORS_ALLOWED_ORIGINS')\nSECURE_SSL_REDIRECT = True",
        "if not os.environ.get('DJANGO_CORS_ALLOWED_ORIGINS', '').strip() or not CORS_ALLOWED_ORIGINS or any(not origin.startswith('https://') for origin in CORS_ALLOWED_ORIGINS):\n    raise ImproperlyConfigured('Set explicit HTTPS DJANGO_CORS_ALLOWED_ORIGINS')\nCSRF_TRUSTED_ORIGINS = [item.strip() for item in os.environ.get('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',') if item.strip()]\nif not CSRF_TRUSTED_ORIGINS or any(not origin.startswith('https://') for origin in CSRF_TRUSTED_ORIGINS):\n    raise ImproperlyConfigured('Set HTTPS DJANGO_CSRF_TRUSTED_ORIGINS')\nSECURE_SSL_REDIRECT = True",
    )
    files["backend/config/settings/production.py"] = production
    files["backend/.env.example"] += "DJANGO_CSRF_TRUSTED_ORIGINS=https://your-domain.example\n"

    # Keep all archive paths relative and portable; never permit traversal.
    for path in files:
        parsed = PurePosixPath(path)
        if parsed.is_absolute() or ".." in parsed.parts or "\\" in path:
            raise ValueError("Generated scaffold contains an unsafe archive path.")
    return files
