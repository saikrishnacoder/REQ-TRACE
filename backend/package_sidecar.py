"""Package the local FastAPI process as the Tauri Windows sidecar."""

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent


def main() -> None:
    target = os.environ.get("TAURI_TARGET_TRIPLE")
    if not target:
        if platform.system() == "Windows" and platform.machine().casefold() in {"amd64", "x86_64"}:
            target = "x86_64-pc-windows-msvc"
        else:
            raise SystemExit("Set TAURI_TARGET_TRIPLE to the Rust target for this desktop build.")

    name = f"reqtrace-api-{target}"
    build_dir = BACKEND_DIR / ".pyinstaller"
    dist_dir = build_dir / "dist"
    binary_dir = PROJECT_DIR / "src-tauri" / "binaries"
    binary_dir.mkdir(parents=True, exist_ok=True)
    venv_python = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
    python = str(venv_python) if venv_python.is_file() else sys.executable

    command = [
        python, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile",
        "--name", name, "--distpath", str(dist_dir), "--workpath", str(build_dir / "work"),
        "--specpath", str(build_dir), "--paths", str(BACKEND_DIR),
        "--collect-submodules", "uvicorn", "--collect-submodules", "fastapi",
        "--collect-submodules", "sqlalchemy", "--collect-submodules", "pydantic_settings",
        str(BACKEND_DIR / "sidecar.py"),
    ]
    subprocess.run(command, cwd=BACKEND_DIR, check=True)
    binary = dist_dir / f"{name}.exe"
    if not binary.is_file():
        raise SystemExit(f"PyInstaller completed without producing {binary}")
    destination = binary_dir / f"{name}.exe"
    shutil.copy2(binary, destination)
    print(f"Tauri sidecar ready: {destination}")


if __name__ == "__main__":
    main()
