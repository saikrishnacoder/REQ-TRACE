import base64
import io
import json
import os
import socket
import subprocess
import time
import urllib.request
from pathlib import Path

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

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

                request = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/v1/projects",
                    data=json.dumps({"name": "Packaged extraction", "key": "PKG"}).encode(),
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(request, timeout=5) as response:
                    project = json.load(response)
                writer = PdfWriter()
                page = writer.add_blank_page(width=612, height=792)
                font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
                page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
                stream = DecodedStreamObject()
                stream.set_data(b"BT /F1 12 Tf 72 720 Td (The system shall retain source text in the project.) Tj ET")
                page[NameObject("/Contents")] = writer._add_object(stream)
                pdf = io.BytesIO()
                writer.write(pdf)
                request = urllib.request.Request(
                    f"http://127.0.0.1:{port}/api/v1/projects/{project['id']}/documents/extract",
                    data=json.dumps({"filename": "source.pdf", "contentBase64": base64.b64encode(pdf.getvalue()).decode("ascii")}).encode(),
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(request, timeout=5) as response:
                    extracted = json.load(response)
                assert extracted["extractionMethod"] == "pypdf"
                assert extracted["candidateStatements"] == ["The system shall retain source text in the project."]
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
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                # taskkill can terminate the hosted API before the PyInstaller
                # bootstrap process exits. Reap that parent explicitly so the
                # smoke test does not fail during cleanup after a healthy start.
                process.kill()
                process.wait(timeout=5)
        else:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
