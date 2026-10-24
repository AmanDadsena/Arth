"""Arth cloud sync: stores anonymous scheme-interest records in DynamoDB.

Only the Arth backend calls this, never a browser. A record is the scheme a
farmer looked at, their district, main crop and a land-size range: no name,
village, phone, Aadhaar or bank, and no user id. Anything else is refused.

Deploy (AWS console):
  Runtime   Python 3.12 or newer, handler `sync_lambda.handler`
  Env vars  SYNC_SECRET  = the same value as ARTH_SYNC_SECRET in backend/.env (32+ chars)
            TABLE_NAME   = arth_records (partition key `record_id`, String)
            PK_NAME      = only if your table's partition key has another name
  IAM       dynamodb:PutItem on that one table. No GetItem/Scan/Query: this
            function cannot read records back, so a leaked secret leaks no data.
  URL       Function URL, auth type NONE (the secret header is the auth), CORS off.
  TTL       optional: enable DynamoDB TTL on the `expires_at` attribute.
"""

import base64
import hmac
import json
import os
import re
import time

import boto3
from botocore.exceptions import ClientError

TABLE = boto3.resource("dynamodb").Table(os.environ.get("TABLE_NAME", "arth_records"))
PK = os.environ.get("PK_NAME", "record_id")
SECRET = os.environ.get("SYNC_SECRET", "")

MAX_BODY = 64 * 1024
MAX_RECORDS = 25
KEEP_DAYS = 365

# The whole record format. A key outside this set fails the batch, so a bug in
# the backend can never put a name or phone number into the table.
FIELDS = {"recordId", "schemeId", "district", "crop", "landBand", "lang", "day"}
_ID = re.compile(r"^[0-9a-f]{32}$")
_SLUG = re.compile(r"^[a-z][a-z0-9_-]{0,39}$")
_DISTRICT = re.compile(r"^[A-Z][A-Za-z .-]{1,39}$")  # English district names only, from Arth's list
_DAY = re.compile(r"^20\d\d-[01]\d-[0-3]\d$")
LAND_BANDS = {"0-1", "1-2", "2-5", "5-10", "10+"}
LANGS = {"en", "hi", "mr"}


def _reply(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body),
    }


def _clean(r) -> dict | None:
    """The DynamoDB item for one record, or None if anything is off."""
    if not isinstance(r, dict) or not r.keys() <= FIELDS:
        return None

    def ok(key, test, optional=True):
        v = r.get(key)
        return (optional and v is None) or (isinstance(v, str) and test(v))

    checks = [
        ok("recordId", _ID.match, optional=False),
        ok("schemeId", _SLUG.match, optional=False),
        ok("lang", LANGS.__contains__, optional=False),
        ok("day", _DAY.match, optional=False),
        ok("district", _DISTRICT.match),
        ok("crop", _SLUG.match),
        ok("landBand", LAND_BANDS.__contains__),
    ]
    if not all(checks):
        return None
    item = {
        PK: r["recordId"],
        "scheme_id": r["schemeId"],
        "lang": r["lang"],
        "day": r["day"],
        "expires_at": int(time.time()) + KEEP_DAYS * 86400,
    }
    for src, dst in (("district", "district"), ("crop", "crop"), ("landBand", "land_band")):
        if r.get(src) is not None:
            item[dst] = r[src]
    return item


def handler(event, context):
    if len(SECRET) < 32:
        return _reply(503, {"error": "not_configured"})
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    # Constant-time compare; checked before anything else so strangers learn nothing.
    if not hmac.compare_digest(headers.get("x-arth-secret", "").encode(), SECRET.encode()):
        return _reply(401, {"error": "unauthorized"})
    if event.get("requestContext", {}).get("http", {}).get("method") != "POST":
        return _reply(405, {"error": "method_not_allowed"})

    raw = event.get("body") or ""
    if len(raw) > MAX_BODY * 2:
        return _reply(413, {"error": "too_large"})
    try:
        body = base64.b64decode(raw) if event.get("isBase64Encoded") else raw.encode()
        if len(body) > MAX_BODY:
            return _reply(413, {"error": "too_large"})
        records = json.loads(body)["records"]
    except (ValueError, KeyError, TypeError):
        return _reply(400, {"error": "bad_json"})
    if not isinstance(records, list) or not 1 <= len(records) <= MAX_RECORDS:
        return _reply(400, {"error": "bad_batch"})
    items = [_clean(r) for r in records]
    if any(i is None for i in items):
        return _reply(400, {"error": "bad_record"})

    for item in items:
        try:
            # Idempotent: the backend may resend a batch after a timeout.
            TABLE.put_item(Item=item, ConditionExpression="attribute_not_exists(#pk)",
                           ExpressionAttributeNames={"#pk": PK})
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
    return _reply(200, {"stored": len(items)})
