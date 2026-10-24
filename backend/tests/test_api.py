"""End-to-end API behaviour against the contract in docs/SPEC.md."""
import sqlite3

import pytest

from .conftest import PROFILE, auth, jpeg_bytes
from .test_pii import VALID_AADHAAR

A = auth("farmer-1")
B = auth("farmer-2")


def put_profile(client, headers=A, **kw):
    return client.put("/api/farmer/me", json={**PROFILE, **kw}, headers=headers)


# --- profile ------------------------------------------------------------------


def test_profile_roundtrip_rounds_coords(client):
    r = put_profile(client)
    assert r.status_code == 200
    body = r.json()
    assert body["lat"] == 20.08 and body["lon"] == 74.11
    assert body["createdAt"] and body["updatedAt"]
    assert client.get("/api/farmer/me", headers=A).json() == body


def test_profile_rejects_unknown_and_invalid_fields(client):
    assert put_profile(client, isAdmin=True).status_code == 400
    assert put_profile(client, lat=51.5).status_code == 400  # outside India
    assert put_profile(client, soilType="moon").status_code == 400
    r = put_profile(client, name="x" * 500)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_request"
    assert "x" * 50 not in r.text  # never echoes submitted values


def test_users_are_isolated(client):
    put_profile(client, A, name="Ramesh")
    assert client.get("/api/farmer/me", headers=B).status_code == 404
    put_profile(client, B, name="Sita")
    assert client.get("/api/farmer/me", headers=A).json()["name"] == "Ramesh"


def test_profile_encrypted_at_rest(client, tmp_path):
    put_profile(client, name="Ramesh Patil")
    raw = b"".join(p.read_bytes() for p in tmp_path.glob("arth.db*"))  # db + WAL
    assert b"Ramesh" not in raw and b"Niphad" not in raw and b"farmer-1" not in raw


def test_delete_removes_profile_and_history(client, net, tmp_path):
    put_profile(client)
    net.llm_replies.append(DOCTOR_OK)
    client.post("/api/ai/crop-doctor", headers=A, files={"image": ("leaf.jpg", jpeg_bytes(), "image/jpeg")},
                data={"lang": "en"})
    assert client.delete("/api/farmer/me", headers=A).json() == {"deleted": True}
    assert client.get("/api/farmer/me", headers=A).status_code == 404
    con = sqlite3.connect(tmp_path / "arth.db")
    assert con.execute("SELECT COUNT(*) FROM history").fetchone()[0] == 0
    assert con.execute("SELECT COUNT(*) FROM profiles").fetchone()[0] == 0


# --- weather, brief, calendar, schemes -----------------------------------------


def test_weather_contract_and_advisories(client):
    put_profile(client)
    r = client.get("/api/weather", params={"lat": 20.08, "lon": 74.11, "lang": "en"}, headers=A)
    assert r.status_code == 200
    w = r.json()
    assert w["location"] == "Niphad, Nashik"
    assert len(w["daily"]) == 7 and set(w["current"]) == {"tempC", "feelsLikeC", "humidity", "windKmh",
                                                          "rainProb", "condition"}
    rules = {a["rule"] for a in w["advisories"]}
    assert rules == {"rain_no_spray", "wind_no_spray", "heat_irrigate"}
    assert w["daily"][2]["condition"] == "thunderstorm"
    assert "no-store" not in r.headers.get("cache-control", "")  # public data, PWA may cache


def test_weather_offline_serves_cached(client, net):
    params = {"lat": 20.08, "lon": 74.11, "lang": "en"}
    assert client.get("/api/weather", params=params, headers=A).status_code == 200
    net.weather_ok = False
    from app.services import weather
    for k, (_, v) in list(weather._cache._data.items()):
        weather._cache._data[k] = (0.0, v)  # expire it
    assert client.get("/api/weather", params=params, headers=A).status_code == 200


def test_weather_unavailable_error_shape(client, net):
    net.weather_ok = False
    r = client.get("/api/weather", params={"lat": 20.08, "lon": 74.11}, headers=A)
    assert r.status_code == 503 and r.json()["error"]["code"] == "weather_unavailable"


def test_brief(client):
    assert client.get("/api/brief", headers=A).status_code == 404  # needs a profile
    put_profile(client)
    b = client.get("/api/brief", params={"lang": "mr"}, headers=A).json()
    assert b["greeting"] == "नमस्कार Ramesh"
    assert 1 <= len(b["actions"]) <= 3 and b["actions"][0]["priority"] == "high"
    assert {t["name"] for t in b["toolCalls"]} >= {"get_weather", "get_mandi_prices", "get_crop_calendar"}
    assert b["priceAlerts"][0]["commodity"] == "onion"


def test_brief_survives_upstream_outage(client, net):
    put_profile(client)
    net.weather_ok = False
    net.mandi_ok = False
    r = client.get("/api/brief", headers=A)
    assert r.status_code == 200 and r.json()["weather"] == []


def test_calendar_uses_profile(client):
    put_profile(client, irrigation="rainfed")
    r = client.get("/api/calendar", params={"season": "rabi", "lang": "en"}, headers=A).json()
    wheat = next(c for c in r["recommendations"] if c["crop"] == "wheat")
    assert wheat["suitability"] == "low"
    assert set(wheat["sowingWindow"]) == {"from", "to"}


def test_calendar_rejects_bad_season(client):
    assert client.get("/api/calendar", params={"season": "monsoon"}, headers=A).status_code == 400


def test_schemes(client):
    body = {"answers": {"ownsLand": True, "landAcres": 2.5, "category": "general", "hasBankAccount": True,
                        "hasAadhaar": True, "isWoman": False, "irrigation": "drip", "incomeTaxPayer": False},
            "lang": "hi"}
    r = client.post("/api/schemes/match", json=body, headers=A).json()
    assert {"id", "name", "eligible", "reasons", "benefit", "documents", "officialUrl"} == set(r["schemes"][0])
    assert r["schemes"][0]["eligible"]


# --- mandi --------------------------------------------------------------------


def test_mandi_prices(client):
    r = client.get("/api/mandi/prices", params={"commodity": "onion", "lat": 20.08, "lon": 74.11}, headers=A)
    assert r.status_code == 200
    p = r.json()
    prices = [m["modalPrice"] for m in p["markets"]]
    assert prices == sorted(prices, reverse=True)
    assert {m["market"] for m in p["markets"]} == {"Lasalgaon", "Pune", "Yeola"}  # Gujarat/bad rows dropped
    assert p["trendMarket"] == "Lasalgaon" and len(p["trend"]) == 8
    assert p["changePct7d"] > 0 and p["unit"] == "quintal"


def test_mandi_key_never_logged(client, caplog):
    client.get("/api/mandi/prices", params={"commodity": "onion", "lat": 20.08, "lon": 74.11}, headers=A)
    assert "test-key" not in caplog.text


def test_mandi_offline_uses_stored_prices(client, net):
    params = {"commodity": "onion", "lat": 20.08, "lon": 74.11}
    client.get("/api/mandi/prices", params=params, headers=A)
    from app.services import mandi
    mandi._fetch_cache._data.clear()
    net.mandi_ok = False
    assert client.get("/api/mandi/prices", params=params, headers=A).status_code == 200


def test_mandi_unavailable_without_data(client, net):
    net.mandi_ok = False
    r = client.get("/api/mandi/prices", params={"commodity": "onion", "lat": 20.08, "lon": 74.11}, headers=A)
    assert r.status_code == 503


def test_mandi_rejects_injection_in_commodity(client):
    r = client.get("/api/mandi/prices", params={"commodity": "onion' OR 1=1--", "lat": 20.08, "lon": 74.11},
                   headers=A)
    assert r.status_code == 400


def test_sell_advice(client, net):
    net.llm_replies.append({"reasoning": "Lasalgaon gives the most after transport."})
    body = {"commodity": "onion", "quantityQuintals": 20, "lat": 20.08, "lon": 74.11, "lang": "en"}
    a = client.post("/api/mandi/sell-advice", json=body, headers=A).json()
    nets = [o["netEarning"] for o in a["options"]]
    assert nets == sorted(nets, reverse=True) and a["netEarning"] == nets[0]
    for o in a["options"]:
        assert o["netEarning"] == o["modalPrice"] * 20 - o["transportCost"]
    assert a["recommendation"] in ("SELL_NOW", "WAIT") and a["reasoning"]
    # The model saw only market facts, never personal data
    sent = str(net.llm_requests[-1])
    assert "Ramesh" not in sent and "farmer-1" not in sent


def test_sell_advice_works_when_model_down(client, net):
    net.ollama_up = False
    body = {"commodity": "onion", "quantityQuintals": 5, "lat": 20.08, "lon": 74.11, "lang": "mr"}
    r = client.post("/api/mandi/sell-advice", json=body, headers=A)
    assert r.status_code == 200 and r.json()["reasoning"] == ""


# --- AI -----------------------------------------------------------------------

DOCTOR_OK = {"diagnosis": "Purple blotch", "scientific_name": "Alternaria porri", "confidence": 0.88,
             "severity": "medium", "symptoms": ["purple spots"],
             "treatment": {"organic": ["remove leaves"], "chemical": ["Mancozeb — use label dose"]},
             "prevention": ["spacing"], "unsure": False}

LABEL_OK = {"product_name": "Mancozeb 75% WP", "active_ingredient": "Mancozeb 75% w/w", "formulation": "75% WP",
            "dose_min": 2.5, "dose_max": 2.5, "dose_unit": "g", "dose_basis": "per_litre",
            "water_litres_per_area": None, "waiting_period_days": 15, "safety": ["Wear gloves"],
            "warnings": ["Toxic to fish"], "photo_problem": "none", "confidence": 0.93}


def img():
    return {"image": ("photo.jpg", jpeg_bytes(), "image/jpeg")}


def test_crop_doctor(client, net):
    net.llm_replies.append(DOCTOR_OK)
    r = client.post("/api/ai/crop-doctor", headers=A, files=img(), data={"lang": "en", "crop": "onion"})
    d = r.json()
    assert r.status_code == 200 and d["escalate"] is False and d["model"] == "gemma-4-e2b"
    req = net.llm_requests[-1]
    assert req["format"]["type"] == "object" and req["messages"][1]["images"]
    assert r.headers["cache-control"] == "no-store"


def test_crop_doctor_without_symptoms_escalates(client, net):
    """Live finding: a drawn leaf got a confident diagnosis with no symptoms listed."""
    net.llm_replies.append({**DOCTOR_OK, "confidence": 0.9, "symptoms": []})
    assert client.post("/api/ai/crop-doctor", headers=A, files=img()).json()["escalate"] is True
    net.llm_replies.append({**DOCTOR_OK, "confidence": 0.9, "symptoms": ["null"]})
    assert client.post("/api/ai/crop-doctor", headers=A, files=img()).json()["escalate"] is True


def test_label_placeholder_words_become_empty(client, net):
    """Live finding: E2B wrote the word "null" as the product name on a blurred label."""
    net.llm_replies.append({**LABEL_OK, "product_name": "null", "active_ingredient": "None",
                            "formulation": "N/A", "photo_problem": "blurry"})
    d = client.post("/api/ai/label-reader", headers=A, files=img()).json()
    assert (d["productName"], d["activeIngredient"], d["formulation"]) == ("", "", None)


def test_crop_doctor_low_confidence_escalates(client, net):
    net.llm_replies.append({**DOCTOR_OK, "confidence": 0.4})
    assert client.post("/api/ai/crop-doctor", headers=A, files=img()).json()["escalate"] is True


def test_label_reader_computes_dose_in_python(client, net):
    net.llm_replies.append(LABEL_OK)
    r = client.post("/api/ai/label-reader", headers=A, files=img(), data={"lang": "en", "tankSizeLitres": "16"})
    d = r.json()
    assert d["dosePerTank"] == {"amount": 40.0, "unit": "g"} and d["escalate"] is False
    assert d["tankSizeLitres"] == 16 and d["waitingPeriodDays"] == 15


def test_label_reader_never_guesses(client, net):
    net.llm_replies.append({**LABEL_OK, "dose_min": None, "dose_max": None})
    d = client.post("/api/ai/label-reader", headers=A, files=img()).json()
    assert d["dosePerTank"] is None and d["escalate"] is True
    net.llm_replies.append({**LABEL_OK, "photo_problem": "blurry"})
    d = client.post("/api/ai/label-reader", headers=A, files=img()).json()
    assert d["dosePerTank"] is None and d["escalate"] is True and d["waitingPeriodDays"] is None
    net.llm_replies.append({**LABEL_OK, "confidence": 0.3})
    assert client.post("/api/ai/label-reader", headers=A, files=img()).json()["escalate"] is True


@pytest.mark.parametrize("problem", ["blurry", "cut_off", "not_a_label"])
def test_label_photo_problem_never_gives_dose_even_with_values(client, net, problem):
    """Live finding: a small model copied the dose yet flagged the photo. Never trust such values."""
    net.llm_replies.append({**LABEL_OK, "photo_problem": problem, "confidence": 1.0})
    d = client.post("/api/ai/label-reader", headers=A, files=img()).json()
    assert d["dosePerTank"] is None and d["escalate"] is True


def test_model_bad_json_retries_then_fails_cleanly(client, net):
    net.llm_replies += ["not json", "{\"still\": \"wrong\"}"]
    r = client.post("/api/ai/crop-doctor", headers=A, files=img())
    assert r.status_code == 502 and r.json()["error"]["code"] == "ai_bad_output"
    net.llm_replies += ["oops", DOCTOR_OK]
    assert client.post("/api/ai/crop-doctor", headers=A, files=img()).status_code == 200


def test_model_down_is_503(client, net):
    net.ollama_up = False
    r = client.post("/api/ai/crop-doctor", headers=A, files=img())
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_unavailable"


def test_explain_document_requires_consent(client):
    r = client.post("/api/ai/explain-document", headers=A, files=img(), data={"lang": "en"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_required"


def test_explain_document_redacts_model_output(client, net):
    net.llm_replies.append({
        "readable": True, "doc_type": "Bank notice",
        "summary": f"Your account 123456789012 linked to Aadhaar {VALID_AADHAAR} needs KYC. Call 9876543210.",
        "key_points": ["PAN ABCDE1234F must be updated"],
        "deadlines": [{"label": "KYC", "date": "2026-11-15"}, {"label": "bad", "date": "15/11/2026"}],
        "next_steps": ["Visit branch"]})
    r = client.post("/api/ai/explain-document", headers=A, files=img(), data={"lang": "en", "consent": "true"})
    d = r.json()
    text = str(d)
    assert VALID_AADHAAR not in text and "9876543210" not in text and "ABCDE" not in text
    assert set(d["redactedFields"]) == {"Aadhaar number", "Mobile number", "PAN", "Bank account number"}
    assert d["deadlines"] == [{"label": "KYC", "date": "2026-11-15"}]


def test_voice_navigate_whitelisted(client, net, stt):
    net.llm_replies.append({"reply": "Opening mandi", "intent": "navigate", "navigate_to": "/mandi",
                            "slots": [], "escalate": False})
    files = {"audio": ("a.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 100, "audio/webm")}
    d = client.post("/api/ai/voice", headers=A, files=files,
                    data={"lang": "mr", "context": '{"screen":"home"}'}).json()
    assert d["intent"] == "navigate" and d["navigateTo"] == "/mandi" and d["transcript"] == stt.text


def test_voice_blocks_unknown_route_and_fields(client, net, stt):
    files = {"audio": ("a.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 100, "audio/webm")}
    net.llm_replies.append({"reply": "ok", "intent": "navigate", "navigate_to": "https://evil.example",
                            "slots": [], "escalate": False})
    d = client.post("/api/ai/voice", headers=A, files=files, data={"context": "{}"}).json()
    assert d["navigateTo"] is None and d["intent"] == "unknown"
    net.llm_replies.append({"reply": "ok", "intent": "fill_form", "navigate_to": None, "escalate": False,
                            "slots": [{"field": "name", "value": "Ramesh"}, {"field": "isAdmin", "value": "1"}]})
    d = client.post("/api/ai/voice", headers=A, files=files,
                    data={"context": '{"screen":"schemes","formFields":["name"]}'}).json()
    assert d["slots"] == {"name": "Ramesh"}


def test_voice_redacts_before_model(client, net, stt):
    stt.text = f"my aadhaar is {VALID_AADHAAR}"
    net.llm_replies.append({"reply": "ok", "intent": "question", "navigate_to": None, "slots": [],
                            "escalate": False})
    files = {"audio": ("a.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 100, "audio/webm")}
    d = client.post("/api/ai/voice", headers=A, files=files, data={"context": "{}"}).json()
    assert VALID_AADHAAR not in str(net.llm_requests[-1]) and VALID_AADHAAR not in d["transcript"]


def test_voice_bad_context(client):
    files = {"audio": ("a.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 100, "audio/webm")}
    r = client.post("/api/ai/voice", headers=A, files=files, data={"context": "{not json"})
    assert r.status_code == 400


# --- uploads ------------------------------------------------------------------


def test_upload_must_be_real_image(client):
    fake = {"image": ("x.jpg", b"<?php system($_GET['c']); ?>", "image/jpeg")}
    r = client.post("/api/ai/crop-doctor", headers=A, files=fake)
    assert r.status_code == 415


def test_truncated_image_rejected(client):
    broken = {"image": ("x.jpg", jpeg_bytes()[:40], "image/jpeg")}
    assert client.post("/api/ai/crop-doctor", headers=A, files=broken).status_code == 415


def test_missing_image(client):
    r = client.post("/api/ai/crop-doctor", headers=A, data={"lang": "en"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "missing_image"


def test_exif_gps_stripped_before_model(client, net):
    import base64
    import io

    from PIL import Image
    net.llm_replies.append(DOCTOR_OK)
    files = {"image": ("x.jpg", jpeg_bytes((2000, 1500), exif_gps=True), "image/jpeg")}
    client.post("/api/ai/crop-doctor", headers=A, files=files)
    sent = base64.b64decode(net.llm_requests[-1]["messages"][1]["images"][0])
    with Image.open(io.BytesIO(sent)) as im:
        assert not im.getexif() and max(im.size) <= 1024


def test_oversized_upload_413(client):
    big = {"image": ("x.jpg", b"\xff\xd8\xff" + b"0" * (6 * 1024 * 1024), "image/jpeg")}
    r = client.post("/api/ai/crop-doctor", headers=A, files=big)
    assert r.status_code == 413 and r.json()["error"]["code"] == "too_large"


def test_bad_audio_type(client):
    files = {"audio": ("a.webm", b"MZ\x90\x00 not audio", "audio/webm")}
    assert client.post("/api/ai/voice", headers=A, files=files).status_code == 415


# --- HTTP hardening -------------------------------------------------------------


def test_security_headers(client):
    r = client.get("/api/farmer/me", headers=A)
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert r.headers["cache-control"] == "no-store"


def test_cors_allowlist(client):
    ok = client.options("/api/brief", headers={"Origin": "http://localhost:5173",
                                               "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options("/api/brief", headers={"Origin": "https://evil.example",
                                                "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_rate_limit(make_client):
    c = make_client(rate_limit_rps=0.001, rate_limit_burst=3)
    codes = [c.get("/api/health").status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3] == 429


def test_unknown_route_error_shape(client):
    r = client.get("/api/nope", headers=A)
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_docs_hidden_outside_development(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_health(client, net):
    assert client.get("/api/health").json()["modelReady"] is True
    net.ollama_up = False
    assert client.get("/api/health").json()["modelReady"] is False


def test_health_not_ready_until_loaded_and_starts_warm_up(client, net):
    """Live finding: an installed-but-unloaded model reported ready and the first call timed out."""
    net.model_loaded = False
    before = len(net.llm_requests)
    assert client.get("/api/health").json()["modelReady"] is False
    client.get("/api/health")  # a second check must not start a second warm-up
    warmups = net.llm_requests[before:]
    assert len(warmups) == 1 and warmups[0]["options"]["num_predict"] == 1
    assert warmups[0]["messages"][0]["images"]  # vision encoder warmed too
    net.llm_replies.append(DOCTOR_OK)
    client.post("/api/ai/crop-doctor", headers=A, files=img())
    # a different num_ctx makes Ollama reload the model on the first real request
    assert warmups[0]["options"]["num_ctx"] == net.llm_requests[-1]["options"]["num_ctx"]


# --- optional onboarding answers (frontend commit 7b29e0f) ------------------------

BASICS = {"experienceYears": 7, "landOwnership": "lease", "farmingType": "mixed",
          "goals": ["better_price", "schemes", "better_price"], "sellsAt": ["mandi", "fpo"],
          "livestock": ["cow", "goat"]}


def test_profile_with_onboarding_answers_roundtrip(client):
    r = put_profile(client, **BASICS)
    assert r.status_code == 200
    body = r.json()
    assert body["goals"] == ["better_price", "schemes"]  # duplicates removed, order kept
    assert {k: body[k] for k in ("experienceYears", "landOwnership", "farmingType", "sellsAt", "livestock")} == \
        {k: BASICS[k] for k in ("experienceYears", "landOwnership", "farmingType", "sellsAt", "livestock")}
    assert client.get("/api/farmer/me", headers=A).json() == body


def test_unanswered_questions_are_absent_not_null(client):
    body = put_profile(client).json()
    for key in BASICS:
        assert key not in body
    assert body["consentAt"] == PROFILE["consentAt"]  # required-by-contract fields still present
    stored = client.get("/api/farmer/me", headers=A).json()
    assert not set(BASICS) & set(stored)


def test_profile_consent_null_is_returned(client):
    body = put_profile(client, consentAt=None).json()
    assert "consentAt" in body and body["consentAt"] is None


@pytest.mark.parametrize("bad", [
    {"experienceYears": -1}, {"experienceYears": 200}, {"landOwnership": "rent"},
    {"farmingType": "hydroponic"}, {"goals": ["get_rich"]}, {"sellsAt": ["amazon"]},
    {"livestock": ["dragon"]}, {"goals": ["more_yield"] * 7},
])
def test_onboarding_answers_validated(client, bad):
    r = put_profile(client, **bad)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_request"


def test_editing_profile_can_drop_answers(client):
    put_profile(client, **BASICS)
    body = put_profile(client).json()  # re-saved without the optional answers
    assert "goals" not in body and "livestock" not in body


def test_soil_is_filled_from_the_district(client):
    body = {k: v for k, v in PROFILE.items() if k != "soilType"}
    p = client.put("/api/farmer/me", json={**body, "district": "Ratnagiri", "lat": 16.99, "lon": 73.3},
                   headers=A).json()
    assert p["soilType"] == "laterite" and p["soilSource"] == "auto"
    # a farmer's correction in Settings is kept
    p = client.put("/api/farmer/me", json={**body, "soilType": "red", "soilSource": "farmer"}, headers=A).json()
    assert p["soilType"] == "red" and p["soilSource"] == "farmer"


def test_soil_endpoint(client):
    assert client.get("/api/soil", headers=A).status_code == 404  # no profile, no point
    r = client.get("/api/soil", params={"lat": 20.0, "lon": 73.79, "lang": "mr"}, headers=A)
    assert r.status_code == 200 and r.json()["district"] == "Nashik" and r.json()["soilType"] == "black"
    assert client.get("/api/soil", params={"lat": 28.6, "lon": 77.2}, headers=A).status_code == 404
    put_profile(client)
    assert client.get("/api/soil", params={"lang": "en"}, headers=A).json()["districtLocal"] == "Nashik"


def test_calendar_defaults_to_today(client):
    put_profile(client)
    r = client.get("/api/calendar", params={"lang": "en"}, headers=A)
    assert r.status_code == 200
    c = r.json()
    assert c["season"] == c["currentSeason"] and c["today"]
    assert {s["season"] for s in c["seasons"]} == {"kharif", "rabi", "zaid"}
    assert {f["crop"] for f in c["inField"]} == {"onion", "grapes"}
    assert all(rec["status"]["phase"] in ("open", "upcoming") for rec in c["recommendations"])


def test_brief_has_today(client):
    put_profile(client)
    b = client.get("/api/brief", params={"lang": "en"}, headers=A).json()
    assert b["location"] == "Niphad, Nashik"
    assert b["current"]["tempC"] is not None and b["seasonNow"]["season"] in ("kharif", "rabi", "zaid")
    assert {f["crop"] for f in b["inField"]} == {"onion", "grapes"}
    assert not any("20" in a["title"] and "-" in a["title"] for a in b["actions"])  # no raw ISO dates
