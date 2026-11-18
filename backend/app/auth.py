"""Small dependency-free password and bearer-token primitives for the API."""

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import time

PBKDF2_ROUNDS = 310_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt, expected = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), _unb64(salt), int(rounds))
        return hmac.compare_digest(actual, _unb64(expected))
    except (ValueError, TypeError):
        return False


def issue_token(user_id: str, email: str, role: str, secret: str, ttl_minutes: int) -> str:
    now = int(time.time())
    payload = {"sub": user_id, "email": email, "role": role, "iat": now, "exp": now + ttl_minutes * 60}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64(signature)}"


def decode_token(token: str, secret: str) -> dict | None:
    try:
        body, signature = token.split(".", 1)
        expected = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(signature)):
            return None
        payload = json.loads(_unb64(body))
        if not isinstance(payload, dict) or not isinstance(payload.get("exp"), int) or payload["exp"] <= int(time.time()):
            return None
        if payload.get("role") not in {"Admin", "Editor", "Viewer"} or not payload.get("sub"):
            return None
        return payload
    except (ValueError, TypeError, UnicodeDecodeError, binascii.Error):
        return None


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
