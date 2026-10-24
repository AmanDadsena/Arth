"""aws/sync_lambda.py on its own: the checks that protect the cloud table."""

import json

import pytest

from . import fake_lambda
from .fake_lambda import SECRET, event

GOOD = {"recordId": "a" * 32, "schemeId": "pm-kisan", "district": "Nashik", "crop": "onion",
        "landBand": "2-5", "lang": "mr", "day": "2026-10-25"}


@pytest.fixture
def table():
    return fake_lambda.FakeTable()


@pytest.fixture
def fn(table):
    return fake_lambda.load(table)


def call(fn, records=None, **kw):
    body = json.dumps({"records": records if records is not None else [GOOD]})
    out = fn.handler(event(body, **kw), None)
    return out["statusCode"], json.loads(out["body"])


def test_stores_a_valid_record(fn, table):
    assert call(fn) == (200, {"stored": 1})
    item = table.items["a" * 32]
    assert item["scheme_id"] == "pm-kisan" and item["land_band"] == "2-5"
    assert item["expires_at"] > 0


def test_resend_is_idempotent(fn, table):
    call(fn)
    assert call(fn) == (200, {"stored": 1})
    assert len(table.items) == 1


@pytest.mark.parametrize("secret", [None, "", "wrong", SECRET + "x"])
def test_wrong_or_missing_secret_is_refused(fn, table, secret):
    assert call(fn, secret=secret)[0] == 401
    assert table.items == {}


def test_no_public_listing(fn):
    # The old function answered GET with every record; now GET without the secret is 401
    # and with it 405: there is no way to read the table through this URL.
    assert fn.handler(event(method="GET", secret=None), None)["statusCode"] == 401
    out = fn.handler(event(method="GET"), None)
    assert out["statusCode"] == 405
    assert "records" not in out["body"]


def test_unconfigured_function_refuses_everything(table):
    fn = fake_lambda.load(table, secret="")
    assert fn.handler(event(json.dumps({"records": [GOOD]}), secret=""), None)["statusCode"] == 503


@pytest.mark.parametrize("bad", [
    {**GOOD, "name": "Ramesh Patil"},          # unknown key
    {**GOOD, "aadhaar": "234123412346"},
    {**GOOD, "district": "ramesh 9876543210"},  # not a district name
    {**GOOD, "crop": "Onion Patil"},
    {**GOOD, "landBand": "2.5"},
    {**GOOD, "recordId": "farmer-1"},
    {**GOOD, "lang": "fr"},
    {**GOOD, "day": "yesterday"},
    {k: v for k, v in GOOD.items() if k != "schemeId"},
    "not a dict",
])
def test_bad_records_fail_the_whole_batch(fn, table, bad):
    assert call(fn, [GOOD | {"recordId": "b" * 32}, bad])[0] == 400
    assert table.items == {}


def test_batch_size_and_body_limits(fn):
    assert call(fn, [])[0] == 400
    assert call(fn, [GOOD] * 26)[0] == 400
    big = fn.handler(event("x" * (200 * 1024)), None)
    assert big["statusCode"] == 413
    assert fn.handler(event("{not json"), None)["statusCode"] == 400


def test_optional_fields_may_be_null(fn, table):
    rec = {**GOOD, "district": None, "crop": None, "landBand": None}
    assert call(fn, [rec])[0] == 200
    assert "district" not in table.items["a" * 32]
