import { isTauri } from '@tauri-apps/api/core';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '');
const API_ORIGIN = API_BASE.replace(/\/api\/v1$/i, '');
const isLoopbackApi = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/i.test(API_ORIGIN);
let startup: Promise<void> | null = null;
let localApiToken: string | null = null;
let stopSidecar: (() => Promise<void>) | null = null;

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitUntilReady(token: string, isExited: () => boolean = () => false) {
  const deadline = Date.now() + 30_000;
  let lastError = 'The local API did not become ready.';
  while (Date.now() < deadline) {
    if (isExited()) throw new Error('The ReqTrace API sidecar exited before it became ready.');
    try {
      const response = await fetch(`${API_ORIGIN}/api/v1/health`, {
        headers: { 'X-ReqTrace-Local-Token': token },
        signal: AbortSignal.timeout(1_500),
      });
      if (response.status === 401) throw new Error('The local API port is already in use by a process that is not this ReqTrace session.');
      if (response.ok) {
        const health = await response.json() as { local_auth?: boolean };
        if (health.local_auth !== true) throw new Error('The API answered without local authentication; refusing an insecure desktop connection.');
        return;
      }
      lastError = `The local API returned HTTP ${response.status} while starting.`;
    } catch (error) {
      if (error instanceof Error && (error.message.includes('port is already in use') || error.message.includes('without local authentication'))) throw error;
      lastError = error instanceof Error ? error.message : lastError;
    }
    await delay(250);
  }
  throw new Error(`ReqTrace API readiness timed out after 30 seconds. ${lastError}`);
}

export function getDesktopApiToken() {
  return isTauri() ? localApiToken : null;
}

async function waitForExit(exited: Promise<void>, milliseconds: number) {
  return Promise.race([exited.then(() => true), delay(milliseconds).then(() => false)]);
}

async function stopApi(token: string, child: { kill: () => Promise<void> }, exited: Promise<void>) {
  try {
    await fetch(`${API_ORIGIN}/api/v1/desktop/shutdown`, {
      method: 'POST',
      headers: { 'X-ReqTrace-Local-Token': token },
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // The process may already be stopping or have exited.
  }
  if (!(await waitForExit(exited, 3_000))) await child.kill();
}

/** Start the packaged local API before the desktop client begins using it. */
export async function startDesktopBackend() {
  if (!isTauri()) return;
  if (startup) return startup;

  startup = (async () => {
    if (!isLoopbackApi) throw new Error('The ReqTrace desktop sidecar must use a loopback API URL.');
    if (import.meta.env.DEV) {
      localApiToken = import.meta.env.VITE_REQTRACE_LOCAL_API_TOKEN || null;
      if (!localApiToken || localApiToken.length < 64) {
        throw new Error('Desktop development requires the ephemeral local API token from `npm run desktop:dev`.');
      }
      await waitUntilReady(localApiToken);
      return;
    }

    const [{ appLocalDataDir }, { getCurrentWindow }, { Command }] = await Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/api/window'),
      import('@tauri-apps/plugin-shell'),
    ]);
    const token = createToken();
    localApiToken = token;
    const dataDir = `${await appLocalDataDir()}\\data`;
    const command = Command.sidecar('binaries/reqtrace-api', [], {
      env: {
        DATABASE_MODE: 'local',
        REQTRACE_DATA_DIR: dataDir,
        REQTRACE_LOCAL_API_TOKEN: token,
        API_HOST: '127.0.0.1',
        API_PORT: '8000',
      },
      processGroup: true,
    });
    let resolveExited!: () => void;
    const exited = new Promise<void>((resolve) => { resolveExited = resolve; });
    let processExited = false;
    command.on('close', () => { processExited = true; resolveExited(); });
    command.on('error', () => { processExited = true; resolveExited(); });
    const child = await command.spawn();
    stopSidecar = () => stopApi(token, child, exited);
    try {
      await waitUntilReady(token, () => processExited);
    } catch (error) {
      await stopSidecar();
      stopSidecar = null;
      localApiToken = null;
      throw error;
    }

    let closing = false;
    let allowClose = false;
    await getCurrentWindow().onCloseRequested(async (event) => {
      if (allowClose || closing) return;
      event.preventDefault();
      closing = true;
      try {
        await stopSidecar?.();
      } finally {
        stopSidecar = null;
        localApiToken = null;
        allowClose = true;
        await getCurrentWindow().close();
      }
    });
    window.dispatchEvent(new Event('online'));
  })();
  return startup;
}
