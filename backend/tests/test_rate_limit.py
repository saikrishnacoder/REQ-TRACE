import asyncio

import pytest

from app import rate_limit


class SharedRedisCounter:
    def __init__(self):
        self.counts: dict[str, int] = {}

    async def eval(self, _script: str, key_count: int, key: str, _ttl_ms: int):
        assert key_count == 1
        count = self.counts.get(key, 0) + 1
        self.counts[key] = count
        return count, 60_000


class UnavailableRedis:
    async def eval(self, *_args):
        raise OSError("connection refused")


def test_redis_rate_limit_is_shared_and_enforces_the_limit() -> None:
    store = SharedRedisCounter()

    assert asyncio.run(rate_limit.consume_rate_limit("shared-user", 2, 60, store)) == (True, 60)
    assert asyncio.run(rate_limit.consume_rate_limit("shared-user", 2, 60, store)) == (True, 60)
    assert asyncio.run(rate_limit.consume_rate_limit("shared-user", 2, 60, store)) == (False, 60)


def test_unavailable_shared_limiter_is_reported_for_public_fail_closed_behavior() -> None:
    with pytest.raises(rate_limit.RateLimitUnavailable):
        asyncio.run(rate_limit.consume_rate_limit("shared-user", 2, 60, UnavailableRedis()))


def test_process_local_development_limit_counts_requests(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit, "_windows", {})
    assert asyncio.run(rate_limit.consume_rate_limit("local-user", 1, 60)) == (True, 60)
    assert asyncio.run(rate_limit.consume_rate_limit("local-user", 1, 60))[0] is False
