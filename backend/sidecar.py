"""Entrypoint for the packaged desktop API sidecar."""

import os

import uvicorn

from app.main import app


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.environ.get("API_HOST", "127.0.0.1"),
        port=int(os.environ.get("API_PORT", "8000")),
        log_level="warning",
    )
