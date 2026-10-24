"""Serves the built web app (frontend/dist) from the API's own origin.

One origin for the demo: no CORS, the service worker works (it doesn't under
`vite dev`), and a tunnel only has to expose one port. API routes are matched
first; anything else is a file from dist, or index.html for an app route
like /schemes so a reload doesn't 404.
"""

import json
import logging
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

log = logging.getLogger("arth")

# Used only if frontend/security-headers.json is missing. The page needs its own
# policy: the API's (default-src 'none', camera/mic off, COOP same-origin) would
# block the app, the microphone and the Google sign-in popup.
_FALLBACK_PAGE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
}


def page_headers(frontend_dir: Path) -> list[tuple[bytes, bytes]]:
    """The frontend's own production headers (frontend/security-headers.json), so
    the demo sends exactly what `npm run preview` and a real host would."""
    path = frontend_dir / "security-headers.json"
    try:
        headers = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log.warning("frontend/security-headers.json not found; using a minimal page policy")
        headers = _FALLBACK_PAGE_HEADERS
    return [(k.lower().encode(), v.encode()) for k, v in headers.items()]


class SpaFiles(StaticFiles):
    """StaticFiles with an index.html fallback for client-side routes."""

    def __init__(self, *, directory: Path, api_prefix: str):
        super().__init__(directory=directory, html=True)
        self._api_prefix = api_prefix

    async def get_response(self, path: str, scope: Scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as e:
            # Only extension-less paths are app routes; a missing /logo.png stays a 404,
            # and an unknown /api/... path must never come back as a 200 web page.
            last = path.rsplit("/", 1)[-1]
            if e.status_code != 404 or "." in last or scope["path"].startswith(self._api_prefix + "/"):
                raise
            return await super().get_response("index.html", scope)
