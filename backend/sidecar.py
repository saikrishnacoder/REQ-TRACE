"""Entrypoint for the packaged desktop API sidecar."""

import os

import uvicorn

from app.main import app


if __name__ == "__main__":
    server = uvicorn.Server(uvicorn.Config(
        app,
        host=os.environ.get("API_HOST", "127.0.0.1"),
        port=int(os.environ.get("API_PORT", "8000")),
        log_level="warning",
    ))
    app.state.request_shutdown = lambda: setattr(server, "should_exit", True)
    server.run()
