"""Tiny async TTL cache with stale fallback and request coalescing.

- Fresh hit: returned immediately.
- Concurrent misses for one key share one upstream call (no stampede).
- Upstream failure: the last good value is served if we have one, so the app
  keeps working when the village loses internet.
"""

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Generic, TypeVar

V = TypeVar("V")


class TTLCache(Generic[V]):
    def __init__(self, ttl_s: float, max_items: int = 512):
        self.ttl = ttl_s
        self.max_items = max_items
        self._data: OrderedDict[str, tuple[float, V]] = OrderedDict()
        self._locks: dict[str, asyncio.Lock] = {}

    def _put(self, key: str, value: V) -> None:
        self._data[key] = (time.monotonic(), value)
        self._data.move_to_end(key)
        while len(self._data) > self.max_items:
            self._data.popitem(last=False)

    async def get(self, key: str, load: Callable[[], Awaitable[V]]) -> V:
        hit = self._data.get(key)
        if hit and time.monotonic() - hit[0] < self.ttl:
            return hit[1]
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            hit = self._data.get(key)
            if hit and time.monotonic() - hit[0] < self.ttl:
                return hit[1]
            try:
                value = await load()
            except Exception:
                if hit:
                    return hit[1]  # stale beats nothing when offline
                raise
            finally:
                self._locks.pop(key, None)
            self._put(key, value)
            return value
