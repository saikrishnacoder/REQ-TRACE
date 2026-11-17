import { isTauri } from '@tauri-apps/api/core';

let stopSidecar: (() => Promise<void>) | null = null;

/** Start the packaged local API before the desktop client begins using it. */
export async function startDesktopBackend() {
  // During development the API is run separately for easier iteration. The
  // packaged app starts its bundled sidecar automatically.
  if (!isTauri() || import.meta.env.DEV || stopSidecar) return;

  try {
    const [{ appLocalDataDir }, { getCurrentWindow }, { Command }] = await Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/api/window'),
      import('@tauri-apps/plugin-shell'),
    ]);
    const dataDir = `${await appLocalDataDir()}\\data`;
    const child = await Command.sidecar('binaries/reqtrace-api', [], {
      env: {
        DATABASE_MODE: 'local',
        REQTRACE_DATA_DIR: dataDir,
        API_HOST: '127.0.0.1',
        API_PORT: '8000',
      },
      processGroup: true,
    }).spawn();
    stopSidecar = () => child.kill();
    await getCurrentWindow().onCloseRequested(async () => {
      await stopSidecar?.();
      stopSidecar = null;
    });

    // The React app can render while the Python sidecar creates its local DB.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch('http://127.0.0.1:8000/api/v1/health');
        if (response.ok) {
          window.dispatchEvent(new Event('online'));
          return;
        }
      } catch {
        // The sidecar is still starting.
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    console.error('ReqTrace local API did not become ready within 7.5 seconds.');
  } catch (error) {
    console.error('ReqTrace could not start its packaged local API.', error);
  }
}
