"""Keyless live mandi prices from MSAMB's public APMC grid."""

from app.services.mandi import parse_msamb

from .conftest import PROFILE, auth

A = auth("farmer-1")

GRID = """
<tr><td colspan="7">24/10/2026</td></tr>
<tr><td>LASALGAON</td><td>RED</td><td>QUINTAL</td><td>900</td><td>1500</td><td>4300</td><td>4050</td></tr>
<tr><td>LASALGAON</td><td>LOCAL</td><td>QUINTAL</td><td>120</td><td>1000</td><td>3000</td><td>2500</td></tr>
<tr><td>PUNE</td><td>----</td><td>NOS</td><td>50</td><td>10</td><td>20</td><td>15</td></tr>
<tr><td>BROKEN</td><td>----</td><td>QUINTAL</td><td>5</td><td>3000</td><td>2000</td><td>9000</td></tr>
<tr><td>CHANDRAPUR-GANJWAD</td><td>----</td><td>QUINTAL</td><td>290</td><td>3,000</td><td>5,500</td><td>4,500</td></tr>
<tr><td colspan="7">23/10/2026</td></tr>
<tr><td>LASALGAON</td><td>RED</td><td>QUINTAL</td><td>800</td><td>1400</td><td>4200</td><td>3900</td></tr>
"""


def test_parse_keeps_quintal_rows_and_main_variety():
    rows = sorted(parse_msamb(GRID), key=lambda r: (r["arrival_date"], r["market"]))
    assert [(r["market"], r["arrival_date"], r["modal_price"]) for r in rows] == [
        ("Lasalgaon", "2026-10-23", 3900),
        ("Chandrapur-Ganjwad", "2026-10-24", 4500),  # thousands separators handled
        ("Lasalgaon", "2026-10-24", 4050),           # the variety with most arrivals wins
    ]
    # "NOS" (count) rows and impossible rows (modal outside min..max) are dropped


def test_parse_ignores_rows_before_any_date_and_garbage():
    assert parse_msamb("<tr><td>X</td><td>-</td><td>QUINTAL</td><td>1</td><td>1</td><td>2</td><td>1</td></tr>") == []
    assert parse_msamb("<html>No record found!</html>") == []


def test_keyless_prices_end_to_end(make_client, net):
    client = make_client(data_gov_in_api_key="")
    r = client.get("/api/mandi/prices", params={"commodity": "onion", "lat": 20.08, "lon": 74.11}, headers=A)
    assert r.status_code == 200
    p = r.json()
    assert {m["market"] for m in p["markets"]} == {"Lasalgaon", "Pune", "Yeola"}
    assert p["trendMarket"] == "Lasalgaon" and len(p["trend"]) == 8  # 7-day history from one fetch
    assert p["changePct7d"] > 0
    # grid came back in Marathi first, so the language was switched once to get English names
    assert net.msamb_calls.count("/Home/ChangeLanguage") == 1
    assert "api.data.gov.in" not in [q.url.host for q in net.requests]


def test_keyless_prices_cached_for_an_hour(make_client, net):
    client = make_client(data_gov_in_api_key="")
    for _ in range(3):
        client.get("/api/mandi/prices", params={"commodity": "onion", "lat": 20.08, "lon": 74.11}, headers=A)
    assert net.msamb_calls.count("/ApmcDetail/DataGridBind") == 2  # one fetch (+1 after the language switch)


def test_keyless_sell_advice_and_brief(make_client, net):
    client = make_client(data_gov_in_api_key="")
    client.put("/api/farmer/me", json=PROFILE, headers=A)
    net.llm_replies.append({"reasoning": "Pune pays more but transport costs more."})
    a = client.post("/api/mandi/sell-advice", headers=A, json={"commodity": "onion", "quantityQuintals": 10,
                                                                "lat": 20.08, "lon": 74.11, "lang": "en"})
    assert a.status_code == 200 and a.json()["options"]
    b = client.get("/api/brief", params={"lang": "en"}, headers=A).json()
    assert [x for x in b["priceAlerts"] if x["commodity"] == "onion"]


def test_unknown_commodity_and_outage(make_client, net):
    client = make_client(data_gov_in_api_key="")
    r = client.get("/api/mandi/prices", params={"commodity": "dragonfruit", "lat": 20.08, "lon": 74.11}, headers=A)
    assert r.status_code == 404
    net.mandi_ok = False
    r = client.get("/api/mandi/prices", params={"commodity": "onion", "lat": 20.08, "lon": 74.11}, headers=A)
    assert r.status_code == 503 and r.json()["error"]["code"] == "mandi_unavailable"


# --- APMC -> district ----------------------------------------------------------------

from app.services.mandi import apmc_district_index, district_for, district_names  # noqa: E402

PROFILE_JSON = [
    {"DistrictNameE": "NASIK", "ApmcList": [{"ApmcNameE": "Lasalgaon"}, {"ApmcNameE": "Sinner"},
                                             {"ApmcNameE": "Pimpalgaon basawant"}, {"ApmcNameE": "Malegaon(Nashik)"}]},
    {"DistrictNameE": "PUNE", "ApmcList": [{"ApmcNameE": "Shirur"}]},
    {"DistrictNameE": "AHILYANAGAR", "ApmcList": [{"ApmcNameE": "Karjat(Nager)"}]},
    {"DistrictNameE": "RAIGAD", "ApmcList": [{"ApmcNameE": "Karjat(Raigad)"}]},
    {"DistrictNameE": "WASHIM", "ApmcList": [{"ApmcNameE": "Malegaon(Washim)"}]},
]


def test_district_matching_real_name_patterns():
    idx = apmc_district_index(PROFILE_JSON)
    cases = {
        "Shirur-Onion Market": "Pune",          # sub-yard of a Pune APMC, not the Nashik village
        "Lasalgaon-Vinchur": "Nasik",
        "Sinnar-Naigaon": "Nasik",              # spelled 'Sinner' in the APMC list
        "Pimpalgaon (B)-Saykheda": "Nasik",     # prefix of 'Pimpalgaon basawant'
        "Karjat (A- Nagar)": "Ahilyanagar",     # bracket hint picks the right Karjat
        "Malegaon-Mungse": "",                  # in Nashik and Washim, no hint: don't guess
        "Nowhere": "",
    }
    for market, district in cases.items():
        assert district_for(market, idx) == district, market


def test_district_aliases_match_geocoder_names():
    assert "ahmadnagar" in district_names("Ahilyanagar")
    assert "aurangabad" in district_names("Chhatrapati  Sambhajinagar")
    assert "nashik" in district_names("NASIK")


def test_keyless_rows_carry_districts(make_client, net):
    client = make_client(data_gov_in_api_key="")
    p = client.get("/api/mandi/prices", params={"commodity": "onion", "lat": 20.08, "lon": 74.11}, headers=A).json()
    got = {m["market"]: m["district"] for m in p["markets"]}
    assert got == {"Lasalgaon": "Nasik", "Yeola": "Nasik", "Pune": "Pune"}


def test_session_reused_across_crops(make_client, net):
    client = make_client(data_gov_in_api_key="")
    q = {"lat": 20.08, "lon": 74.11}
    client.get("/api/mandi/prices", params={"commodity": "onion", **q}, headers=A)
    before = list(net.msamb_calls)
    client.get("/api/mandi/prices", params={"commodity": "soybean", **q}, headers=A)
    added = net.msamb_calls[len(before):]
    # live finding: four crops in a row took 15 s when every fetch set up a new session
    assert added == ["/ApmcDetail/DataGridBind"]


def test_expired_session_is_set_up_again(make_client, net):
    client = make_client(data_gov_in_api_key="")
    q = {"lat": 20.08, "lon": 74.11}
    client.get("/api/mandi/prices", params={"commodity": "onion", **q}, headers=A)
    net.msamb_english = False  # the site reset the session's language
    r = client.get("/api/mandi/prices", params={"commodity": "tomato", **q}, headers=A)
    assert r.status_code == 200 and {m["market"] for m in r.json()["markets"]} == {"Lasalgaon", "Pune", "Yeola"}
