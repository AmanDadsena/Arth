"""Cross-cutting HTTP protections, written as plain ASGI middleware (cheaper than
BaseHTTPMiddleware and safe with streaming bodies).

- Rate limit: token bucket per client IP (docs/SPEC.md §5.10: 10 rps, burst 20),
  on the API only. Behind a tunnel, uvicorn's proxy-headers support sets the client
  from X-Forwarded-For (trusted from 127.0.0.1 only), so each visitor has a bucket.
- Body size cap: rejects oversized uploads from Content-Length before reading.
- Security headers on every response; personal responses marked no-store. The web
  app's pages (demo mode) get the frontend's own page policy instead.
- Access log: method, path, status, ms. Never query strings, bodies or tokens.
"""

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .errors import error_response

log = logging.getLogger("arth.access")

SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"same-site"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
]
# Public data may be cached by the PWA; everything else is personal.
_PUBLIC_PREFIXES = ("/weather", "/mandi/prices", "/calendar", "/health")


class _BodyTooLargeError(Exception):
    pass


class TokenBucket:
    def __init__(self, rate: float, burst: int, max_clients: int = 10_000):
        self.rate, self.burst, self.max_clients = rate, burst, max_clients
        self._buckets: dict[str, tuple[float, float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        tokens, last = self._buckets.get(key, (float(self.burst), now))
        tokens = min(self.burst, tokens + (now - last) * self.rate)
        if len(self._buckets) >= self.max_clients and key not in self._buckets:
            self._buckets.clear()  # bounded memory under a flood of spoofed clients
        if tokens < 1:
            self._buckets[key] = (tokens, now)
            return False
        self._buckets[key] = (tokens - 1, now)
        return True


class ProtectionMiddleware:
    def __init__(self, app: ASGIApp, *, prefix: str, max_body: int, rate: float, burst: int,
                 page_headers: list[tuple[bytes, bytes]] | None = None):
        self.app = app
        self.prefix = prefix
        self.max_body = max_body
        self.bucket = TokenBucket(rate, burst)
        self.page_headers = page_headers

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        path: str = scope["path"]
        status_holder = [0]
        is_page = self.page_headers is not None and not (path == self.prefix or path.startswith(self.prefix + "/"))

        async def send_wrapped(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder[0] = message["status"]
                headers = list(message.get("headers", []))
                if is_page:
                    headers.extend(self.page_headers)
                    # Hashed build files never change; everything else (index.html, sw.js)
                    # must be revalidated so a new build reaches phones.
                    immutable = path.startswith("/assets/") and message["status"] == 200
                    headers.append((b"cache-control", b"public, max-age=31536000, immutable" if immutable
                                    else b"no-cache"))
                else:
                    headers.extend(SECURITY_HEADERS)
                    route = path[len(self.prefix):] if path.startswith(self.prefix) else path
                    if not route.startswith(_PUBLIC_PREFIXES):
                        headers.append((b"cache-control", b"no-store"))
                message["headers"] = headers
            await send(message)

        try:
            # Static app files are cheap and the service worker fetches ~40 at once on
            # first load: only the API is rate limited.
            if scope["method"] != "OPTIONS" and not is_page:
                client = (scope.get("client") or ("unknown", 0))[0]
                if not self.bucket.allow(client):
                    resp = error_response(429, "rate_limited", "Too many requests. Please wait a moment.",
                                          {"Retry-After": "1"})
                    await resp(scope, receive, send_wrapped)
                    return
                length = dict(scope["headers"]).get(b"content-length")
                if length is not None and (not length.isdigit() or int(length) > self.max_body):
                    resp = error_response(413, "too_large", "The upload is too large.")
                    await resp(scope, receive, send_wrapped)
                    return

            received = [0]

            async def receive_capped() -> Message:
                # Chunked uploads carry no Content-Length; count bytes as they arrive.
                message = await receive()
                if message["type"] == "http.request":
                    received[0] += len(message.get("body", b""))
                    if received[0] > self.max_body:
                        raise _BodyTooLargeError
                return message

            try:
                await self.app(scope, receive_capped, send_wrapped)
            except _BodyTooLargeError:
                if status_holder[0]:
                    raise
                resp = error_response(413, "too_large", "The upload is too large.")
                await resp(scope, receive, send_wrapped)
        finally:
            log.info("%s %s %d %.0fms", scope["method"], path, status_holder[0],
                     (time.perf_counter() - start) * 1000)
