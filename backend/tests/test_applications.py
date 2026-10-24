"""Scheme application tracker: journey, privacy and reminders."""

from datetime import timedelta

import pytest

from app.services import weather

from .conftest import PROFILE, auth
from .test_pii import VALID_AADHAAR

A = auth("farmer-1")
B = auth("farmer-2")


def put(client, scheme="pm-kisan", headers=A, lang="en", **body):
    return client.put(f"/api/applications/{scheme}", json=body, params={"lang": lang}, headers=headers)


def test_track_to_approved_journey(client):
    r = put(client)
    assert r.status_code == 200
    app = r.json()
    assert app["status"] == "preparing" and app["name"] == "PM-KISAN"
    assert app["documents"] == ["Aadhaar card", "7/12 land extract", "Bank passbook"]
    assert app["nextStep"] == "Get the 3 remaining documents ready"

    app = put(client, docsReady=[2, 0, 0]).json()
    assert app["docsReady"] == [0, 2] and app["nextStep"].startswith("Get the 1 remaining")

    app = put(client, docsReady=[0, 1, 2]).json()
    assert app["nextStep"].startswith("All documents ready")

    app = put(client, status="applied", docsReady=[0, 1, 2], appliedOn="2026-10-25",
              referenceNo="PMK/2026/00123").json()
    assert app["referenceNo"] == "PMK/2026/00123" and app["appliedOn"] == "2026-10-25"
    assert "reference number" in app["nextStep"]

    assert put(client, status="approved").json()["nextStep"].startswith("Approved")
    [listed] = client.get("/api/applications", params={"lang": "mr"}, headers=A).json()["applications"]
    assert listed["name"] == "पीएम-किसान" and listed["nextStep"].startswith("मंजूर")


@pytest.mark.parametrize("ref", [VALID_AADHAAR, "ABCDE1234F", "9876543210"])
def test_personal_ids_refused_as_reference(client, ref):
    r = put(client, status="applied", referenceNo=ref)
    assert r.status_code == 400 and r.json()["error"]["code"] == "reference_is_personal_id"
    assert ref not in r.text  # never echoed back


@pytest.mark.parametrize("bad", [
    {"status": "submitted"}, {"docsReady": [7]}, {"docsReady": [-1]}, {"referenceNo": "<script>"},
    {"appliedOn": "25/10/2026"}, {"note": "x" * 300}, {"secret": 1},
])
def test_invalid_updates_rejected(client, bad):
    assert put(client, **bad).status_code == 400


def test_unknown_or_malformed_scheme(client):
    assert put(client, scheme="free-money").status_code == 404
    assert put(client, scheme="../profiles").status_code in (400, 404)


def test_note_is_redacted(client):
    note = f"Agent asked for Aadhaar {VALID_AADHAAR} and phone 9876543210"
    app = put(client, note=note).json()
    assert VALID_AADHAAR not in app["note"] and "9876543210" not in app["note"]


def test_users_isolated_and_deletion(client):
    put(client)
    assert client.get("/api/applications", headers=B).json()["applications"] == []
    assert client.delete("/api/applications/pm-kisan", headers=B).status_code == 404
    assert client.delete("/api/applications/pm-kisan", headers=A).json() == {"deleted": True}
    assert client.get("/api/applications", headers=A).json()["applications"] == []


def test_delete_my_data_removes_applications(client):
    client.put("/api/farmer/me", json=PROFILE, headers=A)
    put(client, status="applied", referenceNo="PMK-1")
    client.delete("/api/farmer/me", headers=A)
    assert client.get("/api/applications", headers=A).json()["applications"] == []


def test_encrypted_at_rest(client, tmp_path):
    put(client, status="applied", referenceNo="UNIQUE-REF-777", note="my secret note")
    raw = b"".join(p.read_bytes() for p in tmp_path.glob("arth.db*"))
    assert b"UNIQUE-REF-777" not in raw and b"my secret note" not in raw and b"farmer-1" not in raw


def test_limit(client, monkeypatch):
    from app.services import applications
    monkeypatch.setattr(applications, "MAX_APPLICATIONS", 2)
    assert put(client, scheme="pm-kisan").status_code == 200
    assert put(client, scheme="pmfby").status_code == 200
    assert put(client, scheme="kcc").status_code == 400
    assert put(client, scheme="pmfby", status="applied").status_code == 200  # updating is fine


def test_order_open_and_nearest_deadline_first(client):
    today = weather.today_ist()
    put(client, scheme="kcc", status="approved")
    put(client, scheme="pmfby", lastDate=(today + timedelta(days=20)).isoformat())
    put(client, scheme="pm-kisan", lastDate=(today + timedelta(days=5)).isoformat())
    ids = [a["schemeId"] for a in client.get("/api/applications", headers=A).json()["applications"]]
    assert ids == ["pm-kisan", "pmfby", "kcc"]


def test_brief_reminds_only_near_open_deadlines(client):
    client.put("/api/farmer/me", json=PROFILE, headers=A)
    today = weather.today_ist()
    put(client, scheme="pm-kisan", lastDate=(today + timedelta(days=2)).isoformat())
    put(client, scheme="pmfby", lastDate=(today + timedelta(days=30)).isoformat())  # too far
    put(client, scheme="kcc", status="applied", lastDate=(today + timedelta(days=1)).isoformat())  # done
    actions = client.get("/api/brief", params={"lang": "en"}, headers=A).json()["actions"]
    reminders = [a for a in actions if a["type"] == "scheme"]
    assert len(reminders) == 1
    assert reminders[0]["title"].startswith("Apply for PM-KISAN by") and reminders[0]["priority"] == "high"
    assert reminders[0]["route"] == "/schemes"
