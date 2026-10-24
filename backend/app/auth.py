"""Firebase ID-token verification (docs/SPEC.md §5.1–5.2).

Implements Firebase's documented checks for third-party verification:
RS256 signature against Google's securetoken public keys, `aud` == project ID,
`iss` == https://securetoken.google.com/<project>, `exp`/`iat`/`auth_time`
sane, `sub` non-empty and at most 128 chars. The UID comes only from `sub`.

Keys are cached in memory for as long as Google's Cache-Control allows, and
on disk so a laptop that loses internet can still verify tokens it already
holds keys for (tokens themselves expire after one hour).
"""

import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
import jwt
from fastapi import Request

from .errors import ApiError

log = logging.getLogger("arth.auth")

JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
_MAX_AGE = re.compile(r"max-age=(\d+)")
_LEEWAY_S = 60


@dataclass(frozen=True)
class User:
    uid: str


def _unauthorized(message: str = "Please sign in again") -> ApiError:
    return ApiError(401, "unauthorized", message, {"WWW-Authenticate": "Bearer"})


class FirebaseVerifier:
    def __init__(self, project_id: str, http: httpx.AsyncClient, cache_file: Path | None = None):
        self.project_id = project_id
        self.issuer = f"https://securetoken.google.com/{project_id}"
        self._http = http
        self._cache_file = cache_file
        self._keys: dict[str, object] = {}
        self._expires_at = 0.0
        self._load_disk_cache()

    def _set_keys(self, jwks: dict, expires_at: float) -> None:
        keys = {}
        for k in jwks.get("keys", []):
            if k.get("kty") == "RSA" and k.get("kid"):
                keys[k["kid"]] = jwt.PyJWK(k, algorithm="RS256").key
        self._keys, self._expires_at = keys, expires_at

    def _load_disk_cache(self) -> None:
        if self._cache_file and self._cache_file.exists():
            try:
                self._set_keys(json.loads(self._cache_file.read_text()), 0.0)  # stale: refresh when online
            except (ValueError, jwt.PyJWTError):
                log.warning("ignoring unreadable JWKS cache")

    async def _refresh(self) -> None:
        try:
            r = await self._http.get(JWKS_URL, timeout=5.0)
            r.raise_for_status()
            jwks = r.json()
        except (httpx.HTTPError, ValueError):
            if self._keys:
                return  # offline: keep using the cached keys
            raise ApiError(503, "auth_unavailable", "Sign-in check is unavailable. Try again shortly.") from None
        m = _MAX_AGE.search(r.headers.get("cache-control", ""))
        self._set_keys(jwks, time.time() + (int(m.group(1)) if m else 3600))
        if self._cache_file:
            self._cache_file.write_text(json.dumps(jwks))

    async def _key_for(self, kid: str):
        if time.time() >= self._expires_at or kid not in self._keys:
            await self._refresh()
        key = self._keys.get(kid)
        if key is None:
            raise _unauthorized()
        return key

    async def verify(self, token: str) -> User:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError:
            raise _unauthorized() from None
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise _unauthorized()
        key = await self._key_for(header["kid"])
        try:
            claims = jwt.decode(
                token,
                key=key,
                algorithms=["RS256"],  # pinned: never trust the token's own alg
                audience=self.project_id,
                issuer=self.issuer,
                leeway=_LEEWAY_S,
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
            )
        except jwt.PyJWTError:
            raise _unauthorized() from None
        sub = claims.get("sub")
        auth_time = claims.get("auth_time")
        if not isinstance(sub, str) or not 0 < len(sub) <= 128:
            raise _unauthorized()
        if not isinstance(auth_time, (int, float)) or auth_time > time.time() + _LEEWAY_S:
            raise _unauthorized()
        return User(uid=sub)


async def current_user(request: Request) -> User:
    """FastAPI dependency: the signed-in farmer, or 401."""
    settings = request.app.state.settings
    verifier: FirebaseVerifier | None = request.app.state.verifier
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if verifier is not None and scheme.lower() == "bearer" and token:
        if len(token) > 4096:
            raise _unauthorized()
        return await verifier.verify(token.strip())
    if settings.auth_disabled:
        return User(uid=settings.dev_uid)
    raise _unauthorized()
