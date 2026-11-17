import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest

PROJECT_DIR = Path(__file__).resolve().parents[2]
SIDECAR = PROJECT_DIR / "src-tauri" / "binaries" / "reqtrace-api-x86_64-pc-windows-msvc.exe"


@pytest.mark.skipif(not SIDECAR.is_file(), reason="Build the desktop sidecar to run this release smoke check")
def test_packaged_sidecar_starts_and_migrates_an_isolated_database(tmp_path) -> None:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]

    env = os.environ.copy()
    env.update({
        "DATABASE_MODE": "local",
        "DATABASE_URL": "",
        "REQTRACE_DATA_DIR": str(tmp_path / "data"),
        "API_HOST": "127.0.0.1",
        "API_PORT": str(port),
    })
    process = subprocess.Popen(
        [str(SIDECAR)],
        cwd=PROJECT_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    url = f"http://127.0.0.1:{port}/api/v1/health"
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and process.poll() is None:
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    payload = json.load(response)
                assert payload["database"] == "sqlite"
                assert payload["storage"] == "persistent"
                assert (tmp_path / "data" / "reqtrace.db").is_file()
                return
            except (OSError, TimeoutError):
                time.sleep(0.2)
        pytest.fail(f"Packaged sidecar exited early (code {process.poll()}) or did not become healthy")
    finally:
        if os.name == "nt":
            # PyInstaller one-file mode launches a child process that hosts the
            # API. Kill the full process tree so the test leaves no locked EXE.
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            process.wait(timeout=5)
        else:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
