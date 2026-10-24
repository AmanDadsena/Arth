"""Local SQLite store.

Privacy design:
- Rows are keyed by HMAC(uid), never the raw Firebase UID.
- The profile (name, village, ...) is sealed with AES-256-GCM; the key lives
  outside the database file (env var or a 0600 key file), so a copied .db
  alone reveals nothing.
- History holds only already-redacted summaries and expires after 30 days.
- Market prices and geocodes are public data and stored in clear.

SQLite calls take microseconds; WAL mode lets readers proceed during a write.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .pii import redact_text

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    uid_hash   TEXT PRIMARY KEY,
    sealed     BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    uid_hash   TEXT NOT NULL,
    kind       TEXT NOT NULL,
    summary    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_uid ON history(uid_hash);
CREATE INDEX IF NOT EXISTS history_exp ON history(expires_at);
CREATE TABLE IF NOT EXISTS prices (
    commodity    TEXT NOT NULL,
    market       TEXT NOT NULL,
    district     TEXT NOT NULL,
    arrival_date TEXT NOT NULL,
    min_price    INTEGER NOT NULL,
    max_price    INTEGER NOT NULL,
    modal_price  INTEGER NOT NULL,
    PRIMARY KEY (commodity, market, arrival_date)
);
CREATE TABLE IF NOT EXISTS geocodes (
    place TEXT PRIMARY KEY,
    lat   REAL,
    lon   REAL
);
"""


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_or_create_key(data_dir: Path, configured: str) -> bytes:
    if configured:
        key = base64.b64decode(configured)
        if len(key) != 32:
            raise RuntimeError("ARTH_DATA_KEY must be 32 bytes, base64-encoded")
        return key
    path = data_dir / "data.key"
    if path.exists():
        return base64.b64decode(path.read_text().strip())
    key = secrets.token_bytes(32)
    # O_EXCL: never overwrite a key that appeared meanwhile (it would orphan data).
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(base64.b64encode(key).decode())
    return key


class Database:
    def __init__(self, path: Path | str, key: bytes, history_ttl_days: int = 30):
        self._conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._aead = AESGCM(key)
        # Separate sub-key for UID hashing so the AES key is never used twice.
        self._uid_key = hmac.new(key, b"arth-uid-v1", hashlib.sha256).digest()
        self._ttl = timedelta(days=history_ttl_days)
        with self._lock:
            if str(path) != ":memory:":
                self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.executescript(SCHEMA)

    def close(self) -> None:
        self._conn.close()

    def _x(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    # --- crypto helpers -------------------------------------------------------

    def uid_hash(self, uid: str) -> str:
        return hmac.new(self._uid_key, uid.encode(), hashlib.sha256).hexdigest()

    def _seal(self, uid_hash: str, data: dict) -> bytes:
        nonce = secrets.token_bytes(12)
        # uid_hash as associated data: a sealed row can't be moved to another user.
        return nonce + self._aead.encrypt(nonce, json.dumps(data).encode(), uid_hash.encode())

    def _open(self, uid_hash: str, blob: bytes) -> dict:
        return json.loads(self._aead.decrypt(blob[:12], blob[12:], uid_hash.encode()))

    # --- profiles -------------------------------------------------------------

    def get_profile(self, uid: str) -> dict | None:
        h = self.uid_hash(uid)
        rows = self._x("SELECT sealed, created_at, updated_at FROM profiles WHERE uid_hash=?", (h,))
        if not rows:
            return None
        r = rows[0]
        return {**self._open(h, r["sealed"]), "createdAt": r["created_at"], "updatedAt": r["updated_at"]}

    def put_profile(self, uid: str, profile: dict) -> dict:
        h = self.uid_hash(uid)
        ts = now_iso()
        self._x(
            """INSERT INTO profiles(uid_hash, sealed, created_at, updated_at) VALUES (?,?,?,?)
               ON CONFLICT(uid_hash) DO UPDATE SET sealed=excluded.sealed, updated_at=excluded.updated_at""",
            (h, self._seal(h, profile), ts, ts),
        )
        return self.get_profile(uid)  # type: ignore[return-value]

    def delete_user(self, uid: str) -> None:
        h = self.uid_hash(uid)
        with self._lock:
            self._conn.execute("BEGIN")
            try:
                self._conn.execute("DELETE FROM history WHERE uid_hash=?", (h,))
                self._conn.execute("DELETE FROM profiles WHERE uid_hash=?", (h,))
                self._conn.execute("COMMIT")
            except Exception:
                self._conn.execute("ROLLBACK")
                raise

    # --- history (redacted summaries only) -----------------------------------

    def add_history(self, uid: str, kind: str, summary: str) -> None:
        # Redact here as the last line of defence, whatever the caller passed.
        redacted_summary = redact_text(summary)
        created = datetime.now(UTC)
        self._x(
            "INSERT INTO history(uid_hash, kind, summary, created_at, expires_at) VALUES (?,?,?,?,?)",
            (
                self.uid_hash(uid),
                kind,
                redacted_summary[:500],
                created.strftime("%Y-%m-%dT%H:%M:%SZ"),
                (created + self._ttl).strftime("%Y-%m-%dT%H:%M:%SZ"),
            ),
        )

    def list_history(self, uid: str) -> list[dict]:
        rows = self._x(
            "SELECT kind, summary, created_at FROM history WHERE uid_hash=? AND expires_at>? ORDER BY id DESC",
            (self.uid_hash(uid), now_iso()),
        )
        return [dict(r) for r in rows]

    def purge_expired(self) -> int:
        with self._lock:
            return self._conn.execute("DELETE FROM history WHERE expires_at<=?", (now_iso(),)).rowcount

    # --- public market data ---------------------------------------------------

    def upsert_prices(self, commodity: str, rows: list[dict]) -> None:
        with self._lock:
            self._conn.executemany(
                """INSERT OR REPLACE INTO prices(commodity, market, district, arrival_date,
                   min_price, max_price, modal_price) VALUES (?,?,?,?,?,?,?)""",
                [
                    (commodity, r["market"], r["district"], r["arrival_date"],
                     r["min_price"], r["max_price"], r["modal_price"])
                    for r in rows
                ],
            )

    def latest_prices(self, commodity: str, since: str) -> list[dict]:
        rows = self._x(
            """SELECT p.* FROM prices p JOIN (
                 SELECT market, MAX(arrival_date) d FROM prices
                 WHERE commodity=? AND arrival_date>=? GROUP BY market) l
               ON p.market=l.market AND p.arrival_date=l.d WHERE p.commodity=?""",
            (commodity, since, commodity),
        )
        return [dict(r) for r in rows]

    def price_series(self, commodity: str, market: str, since: str) -> list[dict]:
        rows = self._x(
            """SELECT arrival_date, modal_price FROM prices
               WHERE commodity=? AND market=? AND arrival_date>=? ORDER BY arrival_date""",
            (commodity, market, since),
        )
        return [dict(r) for r in rows]

    def get_geocode(self, place: str) -> tuple[float, float] | bool | None:
        """(lat, lon), None if known to be unresolvable, False if never looked up."""
        rows = self._x("SELECT lat, lon FROM geocodes WHERE place=?", (place,))
        if not rows:
            return False
        r = rows[0]
        return None if r["lat"] is None else (r["lat"], r["lon"])

    def put_geocode(self, place: str, coords: tuple[float, float] | None) -> None:
        lat, lon = coords if coords else (None, None)
        self._x("INSERT OR REPLACE INTO geocodes(place, lat, lon) VALUES (?,?,?)", (place, lat, lon))
