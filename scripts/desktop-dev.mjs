import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const venvPython = path.join(backend, '.venv', 'Scripts', 'python.exe');
const python = process.env.REQTRACE_PYTHON || (existsSync(venvPython) ? venvPython : 'python');
const port = '8000';
const token = randomBytes(32).toString('hex');

const api = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', port], {
  cwd: backend,
  env: {
    ...process.env,
    DATABASE_MODE: 'local',
    API_HOST: '127.0.0.1',
    API_PORT: port,
    REQTRACE_LOCAL_API_TOKEN: token,
  },
  stdio: 'inherit',
  windowsHide: true,
});

let apiExitCode;
let apiExitedResolve;
const apiExited = new Promise((resolve) => { apiExitedResolve = resolve; });
api.once('error', (error) => {
  apiExitCode = 1;
  console.error(`Could not start Python API (${python}):`, error.message);
  apiExitedResolve();
});
api.once('exit', (code) => {
  apiExitCode = code ?? 1;
  apiExitedResolve();
});

const apiUrl = `http://127.0.0.1:${port}/api/v1`;
async function waitForApi() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (apiExitCode !== undefined) throw new Error(`The Python API exited with code ${apiExitCode}.`);
    try {
      const response = await fetch(`${apiUrl}/health`, {
        headers: { 'X-ReqTrace-Local-Token': token },
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 401) throw new Error(`Port ${port} is occupied by a different local API process.`);
      if (response.ok) {
        const health = await response.json();
        if (health.local_auth !== true) throw new Error('The API did not enable local authentication.');
        console.log(`Authenticated ReqTrace API ready at http://127.0.0.1:${port}`);
        return;
      }
    } catch (error) {
      if (error instanceof Error && (error.message.includes('occupied') || error.message.includes('did not enable'))) throw error;
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for the authenticated ReqTrace API (30 seconds).');
}

let tauri;
let tauriExitCode = 1;
let stopping = false;
async function stopApi() {
  if (stopping) return;
  stopping = true;
  try {
    await fetch(`${apiUrl}/desktop/shutdown`, {
      method: 'POST',
      headers: { 'X-ReqTrace-Local-Token': token },
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // The server may already have exited.
  }
  if (await Promise.race([apiExited.then(() => true), delay(3_000).then(() => false)])) return;
  api.kill();
  if (!(await Promise.race([apiExited.then(() => true), delay(2_000).then(() => false)]))) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(api.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    else api.kill('SIGKILL');
  }
}

async function run() {
  try {
    await waitForApi();
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error('Run this script through `npm run desktop:dev` so the Tauri CLI can be resolved.');
    tauri = spawn(process.execPath, [npmCli, 'run', 'tauri', '--', 'dev'], {
      cwd: root,
      env: { ...process.env, VITE_REQTRACE_LOCAL_API_TOKEN: token, VITE_API_URL: apiUrl },
      stdio: 'inherit',
      windowsHide: true,
    });
    tauriExitCode = await new Promise((resolve) => {
      tauri.once('error', (error) => {
        console.error('Could not start Tauri development mode:', error.message);
        resolve(1);
      });
      tauri.once('exit', (code) => resolve(code ?? 1));
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    tauriExitCode = 1;
  } finally {
    await stopApi();
  }
  process.exitCode = tauriExitCode;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    tauri?.kill(signal);
    void stopApi();
  });
}

await run();
