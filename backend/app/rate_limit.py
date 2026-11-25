"""Shared Redis and local-development request rate limiting."""

import time
from typing import Any


class RateLimitUnavailable(RuntimeError):
    pass


_windows: dict[str, tuple[float, int]] = {}
_REDIS_INCREMENT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
"""


async def consume_rate_limit(key: str, maximum: int, window_seconds: int, store: Any = None) -> tuple[bool, int]:
    """Count one request in a shared window, or a process-local dev window."""
    if store is not None:
        try:
            count, ttl_ms = await store.eval(_REDIS_INCREMENT, 1, key, window_seconds * 1000)
            return int(count) <= maximum, max(1, int(ttl_ms / 1000))
        except Exception as exc:
            raise RateLimitUnavailable("The shared rate limit service is unavailable") from exc

    now = time.monotonic()
    started, count = _windows.get(key, (now, 0))
    if now - started >= window_seconds:
        started, count = now, 0
    count += 1
    if len(_windows) > 10_000:
        for old_key, (old_started, _) in list(_windows.items()):
            if now - old_started >= 300:
                del _windows[old_key]
    _windows[key] = (started, count)
    return count <= maximum, max(1, int(window_seconds - (now - started)))
