"""Small in-memory sliding-window rate limiter (per process)."""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> None:
        """Record one hit for `key`; raise HTTP 429 if the limit is exceeded."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                retry = int(self.window - (now - q[0])) + 1
                raise HTTPException(
                    status_code=429,
                    detail={"code": "rate_limited", "message": "Too many requests. Please slow down.", "retryAfter": retry},
                    headers={"Retry-After": str(retry)},
                )
            q.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


auth_ip_limiter = RateLimiter(limit=20, window_seconds=600)
ai_user_limiter = RateLimiter(limit=40, window_seconds=60)
