"""Nearby pest outbreak alerts: privacy threshold, de-duplication and the brief."""

from datetime import UTC, datetime, timedelta

import pytest

from app.db import Database
from app.services import ai, alerts

from .conftest import PROFILE, auth, jpeg_bytes
from .test_api import DOCTOR_OK


@pytest.mark.parametrize(("raw", "key"), [
    ("Alternaria porri", "alternaria porri"),
    ("Alternaria porri (purple blotch)", "alternaria porri"),
    ("  Thrips tabaci Lindeman, 1889 ", "thrips tabaci"),
    ("Plasmopara", "plasmopara"),
    ("null", None), (None, None), ("", None), ("12", None),
])
def test_pest_key(raw, key):
    assert ai.pest_key(raw) == key


@pytest.fixture
def db(tmp_path):
    d = Database(tmp_path / "t.db", b"k" * 32)
    yield d
    d.close()


NOW = datetime(2026, 10, 25, 12, tzinfo=UTC)


def report(db, uid, district="nashik", crop="onion", key="thrips tabaci", lang="en", when=NOW):
    return db.add_pest_report(uid, district, crop, key, "Onion thrips", "Onion thrips", lang, now=when)


def test_threshold_hides_reports_below_three_farmers(db):
    report(db, "a")
    report(db, "b")
    assert db.pest_outbreaks("nashik", NOW - timedelta(days=7), 3) == []
    report(db, "c")
    [row] = db.pest_outbreaks("nashik", NOW - timedelta(days=7), 3)
    assert (row["crop"], row["pest_key"], row["farmers"]) == ("onion", "thrips tabaci", 3)


def test_one_farmer_counts_once_per_week(db):
    assert report(db, "a") is True
    assert report(db, "a", when=NOW + timedelta(hours=5)) is False
    assert report(db, "a", when=NOW + timedelta(days=8)) is True  # a new week is a new report
    assert db.pest_outbreaks("nashik", NOW - timedelta(days=30), 2) == []  # still one farmer


def test_districts_and_window_are_separate(db):
    for uid in "abc":
        report(db, uid, district="pune")
    assert db.pest_outbreaks("nashik", NOW - timedelta(days=7), 3) == []
    for uid in "def":
        report(db, uid, when=NOW - timedelta(days=10))
    assert db.pest_outbreaks("nashik", NOW - timedelta(days=7), 3) == []


def test_delete_user_removes_their_reports(db):
    for uid in "abc":
        report(db, uid)
    db.delete_user("c")
    assert db.pest_outbreaks("nashik", NOW - timedelta(days=7), 3) == []


def test_reports_store_no_identity(db, tmp_path):
    report(db, "farmer-uid-123", district="nashik")
    raw = b"".join(p.read_bytes() for p in tmp_path.glob("t.db*"))
    assert b"farmer-uid-123" not in raw


def test_alert_text_localised_and_prefers_own_crop(db):
    for uid in "abc":
        report(db, uid, crop="grapes", key="plasmopara viticola", lang="mr")
    for uid in "defg":
        report(db, uid, crop="tomato", key="tuta absoluta")
    acts = alerts.nearby_alerts(db, "Nashik", "en", ["grapes"], 3, now=NOW)
    assert [a.priority for a in acts] == ["high", "medium"]  # own crop first even with fewer reports
    assert acts[0].source == "community" and acts[0].route == "/doctor"
    assert acts[0].title == "3 farmers near Nashik reported Onion thrips on grapes this week"
    mr = alerts.nearby_alerts(db, "Nashik", "mr", ["grapes"], 3, now=NOW)
    assert "द्राक्ष" in mr[0].title and "3 शेतकऱ्यांनी" in mr[0].title


# --- end to end through the API ----------------------------------------------------


def _farmer(client, uid, **kw):
    client.put("/api/farmer/me", json={**PROFILE, **kw}, headers=auth(uid))


def _diagnose(client, net, uid, reply):
    net.llm_replies.append(reply)
    return client.post("/api/ai/crop-doctor", headers=auth(uid), data={"lang": "en", "crop": "onion"},
                       files={"image": ("leaf.jpg", jpeg_bytes(), "image/jpeg")})


def test_three_confident_reports_alert_a_neighbour(client, net):
    for uid in ("f1", "f2", "f3", "me"):
        _farmer(client, uid)
    _diagnose(client, net, "f1", DOCTOR_OK)
    _diagnose(client, net, "f2", DOCTOR_OK)
    actions = client.get("/api/brief", params={"lang": "en"}, headers=auth("me")).json()["actions"]
    assert not [a for a in actions if a["source"] == "community"]  # two farmers: below threshold
    _diagnose(client, net, "f3", DOCTOR_OK)
    actions = client.get("/api/brief", params={"lang": "en"}, headers=auth("me")).json()["actions"]
    [alert] = [a for a in actions if a["source"] == "community"]
    assert alert["title"] == "3 farmers near Nashik reported Purple blotch on onion this week"
    assert alert["type"] == "protect" and alert["priority"] == "high"


def test_unsure_diagnoses_never_count(client, net):
    for uid in ("f1", "f2", "f3", "me"):
        _farmer(client, uid)
    for uid in ("f1", "f2", "f3"):
        _diagnose(client, net, uid, {**DOCTOR_OK, "confidence": 0.4})
    actions = client.get("/api/brief", params={"lang": "en"}, headers=auth("me")).json()["actions"]
    assert not [a for a in actions if a["source"] == "community"]


def test_other_district_not_alerted(client, net):
    for uid in ("f1", "f2", "f3"):
        _farmer(client, uid, district="Pune")
        _diagnose(client, net, uid, DOCTOR_OK)
    _farmer(client, "me")
    actions = client.get("/api/brief", params={"lang": "en"}, headers=auth("me")).json()["actions"]
    assert not [a for a in actions if a["source"] == "community"]
