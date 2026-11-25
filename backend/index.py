"""Vercel FastAPI entrypoint when the backend directory is the project root."""

from app.main import app

__all__ = ["app"]
