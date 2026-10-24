"""Opt-in cloud sync: what leaves the device, and when."""

import json

import pytest

from app.config import Settings
from app.services.sync import land_band

from . import fake_lambda
from .conftest import SYNC_URL, auth, make_settings

SHARE = {"schemeId": "pm-kisan", "district": "नाशिक", "crop": "कांदा", "landAcres": 2.5, "lang": "mr"}


@pytest.fixture
def synced(make_client):
    return make_client(sync_url=SYNC_URL, sync_secret=fake_lambda.SECRET)


def test_share_sends_only_the_anonymous_record(synced, net):
    r = synced.post("/api/schemes/share", json=SHARE, headers=auth())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "sent"
    shared = body["shared"]
    assert {k: shared[k] for k in ("schemeId", "district", "crop", "landBand", "lang")} == {
        "schemeId": "pm-kisan", "district": "Nashik", "crop": "onion", "landBand": "2-5", "lang": "mr"}

    sent = net.sync_bodies[0]["records"]
    assert len(sent) == 1
    assert set(sent[0]) == {"recordId", "schemeId", "district", "crop", "landBand", "lang", "day"}
    assert "farmer-1" not in json.dumps(net.sync_bodies)  # no user id, not even hashed into the payload
    req = next(q for q in net.requests if q.url.host == "sync.test.on.aws")
    assert req.headers["x-arth-secret"] == fake_lambda.SECRET
    assert list(net.sync_table.items) == [shared["recordId"]]


def test_personal_fields_cannot_be_sent(synced, net):
    for extra in ({"name": "Ramesh Patil"}, {"village": "Niphad"}, {"bankName": "SBI"}, {"aadhaar": "234123412346"}):
        r = synced.post("/api/schemes/share", json={**SHARE, **extra}, headers=auth())
        assert r.status_code == 400, extra  # schema refuses unknown fields
    assert net.sync_bodies == []


def test_free_text_in_known_fields_is_dropped_not_sent(synced, net):
    r = synced.post("/api/schemes/share", headers=auth(), json={
        **SHARE, "district": "Ramesh Patil, 9876543210", "crop": "my phone 9876543210"})
    shared = r.json()["shared"]
    assert shared["district"] is None and shared["crop"] is None
    assert "9876543210" not in json.dumps(net.sync_bodies)
    assert "Ramesh" not in json.dumps(net.sync_bodies)


def test_offline_share_is_queued_then_sent(synced, net):
    net.sync_up = False
    r = synced.post("/api/schemes/share", json=SHARE, headers=auth())
    assert r.json()["status"] == "queued"
    assert synced.app.state.db.outbox_count() == 1

    net.sync_up = True
    r = synced.post("/api/schemes/share", json={**SHARE, "schemeId": "pmfby"}, headers=auth())
    assert r.json()["status"] == "sent"
    assert synced.app.state.db.outbox_count() == 0
    assert len(net.sync_table.items) == 2


def test_lambda_refusal_keeps_the_record_queued(make_client, net):
    client = make_client(sync_url=SYNC_URL, sync_secret="wrong-secret-" + "y" * 30)
    r = client.post("/api/schemes/share", json=SHARE, headers=auth())
    assert r.json()["status"] == "queued"
    assert net.sync_table.items == {}
    assert client.app.state.db.outbox_count() == 1


def test_repeat_share_is_one_record(synced, net):
    ids = {synced.post("/api/schemes/share", json=SHARE, headers=auth()).json()["shared"]["recordId"]
           for _ in range(3)}
    assert len(ids) == 1
    assert len(net.sync_table.items) == 1
    other = synced.post("/api/schemes/share", json=SHARE, headers=auth("farmer-2")).json()["shared"]
    assert other["recordId"] not in ids


def test_queue_is_capped_per_farmer(synced, net):
    net.sync_up = False
    from app.routers import MAX_QUEUED_PER_FARMER
    for i in range(MAX_QUEUED_PER_FARMER):
        synced.app.state.db.outbox_add("farmer-1", {"recordId": f"{i:032x}"})
    r = synced.post("/api/schemes/share", json=SHARE, headers=auth())
    assert r.status_code == 429


def test_delete_account_clears_unsent_records(synced, net):
    net.sync_up = False
    synced.post("/api/schemes/share", json=SHARE, headers=auth())
    assert synced.app.state.db.outbox_count("farmer-1") == 1
    synced.delete("/api/farmer/me", headers=auth())
    assert synced.app.state.db.outbox_count() == 0


def test_unknown_scheme_and_sign_in_required(synced):
    assert synced.post("/api/schemes/share", json={**SHARE, "schemeId": "made-up"}, headers=auth()).status_code == 422
    assert synced.post("/api/schemes/share", json=SHARE).status_code == 401


def test_sync_off_without_config(client):
    r = client.post("/api/schemes/share", json=SHARE, headers=auth())
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "sync_off"
    assert client.get("/api/health").json()["cloudSync"] is False


def test_health_reports_sync(synced):
    assert synced.get("/api/health").json()["cloudSync"] is True


@pytest.mark.parametrize(("acres", "band"), [(None, None), (0, "0-1"), (0.99, "0-1"), (1, "1-2"),
                                             (2.5, "2-5"), (5, "5-10"), (10, "10+"), (400, "10+")])
def test_land_band(acres, band):
    assert land_band(acres) == band


def test_config_requires_a_strong_secret_and_https(tmp_path):
    with pytest.raises(RuntimeError, match="SYNC_SECRET"):
        make_settings(tmp_path, sync_url=SYNC_URL, sync_secret="short").check_safe()
    with pytest.raises(ValueError):
        Settings(_env_file=None, sync_url="http://plain.example.com/")
