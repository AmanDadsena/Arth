"""Opt-in cloud sync of anonymous scheme interest (aws/sync_lambda.py).

Full redaction by construction: a record is built only from fixed lists
(scheme id, a district from Arth's own list, a crop id, a land-size range),
so free text the farmer typed or said (name, village, bank, a phone number
in the wrong box) has no field to travel in. Anything that doesn't match a
known value is dropped, not cleaned up and sent.

Records wait in the local outbox until the Lambda accepts them, so sharing
works offline and goes out when the internet is back.
"""

import asyncio
import logging
from datetime import date

import httpx

from ..db import Database
from ..schemas import ShareRequest
from . import farm, schemes
from .names import CROP_NAMES

log = logging.getLogger("arth.sync")
BATCH = 25  # the Lambda's per-request limit
_NUKTA = "़"  # "प्याज़" and "प्याज" are the same word


def _crop_id(text: str | None) -> str | None:
    if not text:
        return None
    key = text.strip().lower().replace(_NUKTA, "")
    for crop, names in CROP_NAMES.items():
        if key == crop or key in (n.lower().replace(_NUKTA, "") for n in names.values()):
            return crop
    return None


def land_band(acres: float | None) -> str | None:
    """A range, not the number: exact acres plus a district can point to one farm."""
    if acres is None:
        return None
    for top, band in ((1, "0-1"), (2, "1-2"), (5, "2-5"), (10, "5-10")):
        if acres < top:
            return band
    return "10+"


def build_record(db: Database, uid: str, req: ShareRequest, day: date | None = None) -> dict | None:
    """The exact cloud record, or None for a scheme Arth doesn't know."""
    if req.scheme_id not in schemes.scheme_ids():
        return None
    day_s = (day or date.today()).isoformat()
    district = farm.by_name(req.district)
    return {
        "recordId": db.share_id(uid, req.scheme_id, day_s),
        "schemeId": req.scheme_id,
        "district": district["id"] if district else None,
        "crop": _crop_id(req.crop),
        "landBand": land_band(req.land_acres),
        "lang": req.lang,
        "day": day_s,
    }


class CloudSync:
    def __init__(self, http: httpx.AsyncClient, db: Database, url: str, secret: str, *,
                 timeout_s: float, interval_s: float):
        self._http, self._db = http, db
        self._url, self._secret = url, secret
        self._timeout, self._interval = timeout_s, interval_s
        self._lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        return bool(self._url and self._secret)

    async def flush(self) -> bool:
        """Send the outbox in batches. True when it is empty afterwards."""
        if not self.enabled:
            return False
        async with self._lock:
            while batch := self._db.outbox_pending(BATCH):
                try:
                    r = await self._http.post(self._url, json={"records": batch}, timeout=self._timeout,
                                              headers={"X-Arth-Secret": self._secret})
                except httpx.HTTPError:
                    log.info("cloud sync offline; %d record(s) queued", self._db.outbox_count())
                    return False
                if r.status_code != 200:
                    # Never log the URL or the secret; the status says enough.
                    log.warning("cloud sync refused: HTTP %d", r.status_code)
                    return False
                self._db.outbox_done([rec["recordId"] for rec in batch])
                log.info("cloud sync sent %d record(s)", len(batch))
            return True

    async def run(self) -> None:
        """Background retry, for records shared while offline."""
        while True:
            await asyncio.sleep(self._interval)
            if self.enabled and self._db.outbox_count():
                await self.flush()
