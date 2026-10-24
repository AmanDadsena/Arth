"""Test harness: the real app, with every outside service faked at the HTTP layer.

FakeNet answers Google's JWKS, Ollama, Open-Meteo, data.gov.in and the
geocoder, so tests exercise our real code paths with no network.
"""

import base64
import io
import json
import time
from datetime import date, timedelta

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from PIL import Image

from app.auth import JWKS_URL
from app.config import Settings
from app.main import create_app

from . import fake_lambda

PROJECT = "arth-test"
SYNC_URL = "https://sync.test.on.aws/"
KID = "test-kid"

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(_private_key.public_key()))
JWKS = {"keys": [{**_jwk, "kid": KID, "alg": "RS256", "use": "sig"}]}


def make_token(uid: str = "farmer-1", *, key=None, kid: str = KID, **claims) -> str:
    now = int(time.time())
    payload = {"iss": f"https://securetoken.google.com/{PROJECT}", "aud": PROJECT, "sub": uid,
               "iat": now, "exp": now + 3600, "auth_time": now, **claims}
    payload = {k: v for k, v in payload.items() if v is not None}
    return jwt.encode(payload, key or _private_key, algorithm="RS256", headers={"kid": kid})


def auth(uid: str = "farmer-1") -> dict:
    return {"Authorization": f"Bearer {make_token(uid)}"}


def jpeg_bytes(size=(64, 64), exif_gps: bool = False) -> bytes:
    img = Image.new("RGB", size, (40, 120, 40))
    out = io.BytesIO()
    if exif_gps:
        exif = Image.Exif()
        exif[0x010F] = "PhoneMaker"  # Make
        exif[0x8825] = {1: "N", 2: (20.0, 4.0, 48.0)}  # GPSInfo
        img.save(out, format="JPEG", exif=exif)
    else:
        img.save(out, format="JPEG")
    return out.getvalue()


def forecast_payload(rain=(10, 85, 20, 5, 0, 0, 0), wind=(10, 12, 25, 8, 8, 8, 8), tmax=(31, 30, 39, 30, 30, 30, 30)):
    today = date.today()
    days = [(today + timedelta(days=i)).isoformat() for i in range(7)]
    return {
        "current": {"time": f"{days[0]}T10:00", "temperature_2m": 28.4, "apparent_temperature": 30.1,
                    "relative_humidity_2m": 61, "wind_speed_10m": 11.2, "weather_code": 2},
        "hourly": {"time": [f"{days[0]}T{h:02d}:00" for h in range(24)], "precipitation_probability": [15] * 24},
        "daily": {"time": days, "weather_code": [2, 63, 95, 3, 0, 0, 1],
                  "temperature_2m_max": list(tmax), "temperature_2m_min": [19] * 7,
                  "precipitation_sum": [0, 12.5, 30.0, 0.2, 0, 0, 0],
                  "precipitation_probability_max": list(rain), "wind_speed_10m_max": list(wind)},
    }


def mandi_records(commodity="Onion"):
    today = date.today()
    rows = []
    for i, (market, district, base) in enumerate([("Lasalgaon", "Nashik", 2400), ("Pune", "Pune", 2700),
                                                   ("Yeola", "Nashik", 2300)]):
        for d in range(0, 8):
            day = today - timedelta(days=d)
            rows.append({"state": "Maharashtra", "district": district, "market": market, "commodity": commodity,
                         "variety": "Red", "grade": "FAQ", "arrival_date": day.strftime("%d/%m/%Y"),
                         "min_price": str(base - 300), "max_price": str(base + 300),
                         "modal_price": str(base - d * 10 + i)})
    # Rows that must be filtered out
    rows.append({"state": "Gujarat", "district": "X", "market": "Y", "commodity": commodity,
                 "arrival_date": today.strftime("%d/%m/%Y"), "min_price": "1", "max_price": "2", "modal_price": "1"})
    rows.append({"state": "Maharashtra", "district": "Nashik", "market": "Bad", "commodity": commodity,
                 "arrival_date": "not-a-date", "min_price": "1", "max_price": "2", "modal_price": "1"})
    return rows


def msamb_grid(english: bool) -> str:
    """Rows shaped like msamb.com's DataGridBind output (newest day first, 7-cell rows)."""
    today = date.today()
    names = {"Lasalgaon": "लासलगाव", "Pune": "पुणे", "Yeola": "येवला"}
    out = []
    for d in range(0, 8):
        day = today - timedelta(days=d)
        out.append(f'<tr><td colspan="7">{day.strftime("%d/%m/%Y")}</td></tr>')
        for i, (market, base) in enumerate([("Lasalgaon", 2400), ("Pune", 2700), ("Yeola", 2300)]):
            name = market.upper() if english else names[market]
            unit = "QUINTAL" if english else "क्विंटल"
            modal = base - d * 10 + i
            out.append(f"<tr><td>{name}</td><td>----</td><td>{unit}</td><td>500</td><td>{base - 300}</td>"
                       f"<td>{base + 300}</td><td>{modal}</td></tr>")
    return "\n".join(out)


GEO = {
    "Lasalgaon": (20.1427, 74.2395, "Nashik"),
    "Pune": (18.5196, 73.8553, "Pune"),
    "Yeola": (20.0424, 74.4895, "Nashik"),
}


class FakeNet:
    """Routes outgoing httpx requests. Tests push model replies onto `llm_replies`."""

    def __init__(self):
        self.llm_replies: list[dict | str] = []
        self.llm_requests: list[dict] = []
        self.forecast = forecast_payload()
        self.mandi_ok = True
        self.msamb_english = False
        self.msamb_calls: list[str] = []
        self.weather_ok = True
        self.ollama_up = True
        self.model_loaded = True
        self.jwks_calls = 0
        self.jwks_ok = True
        self.requests: list[httpx.Request] = []
        self.sync_up = True
        self.sync_table = fake_lambda.FakeTable()
        self.sync_lambda = fake_lambda.load(self.sync_table)
        self.sync_bodies: list[dict] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url)
        if url.startswith(JWKS_URL):
            self.jwks_calls += 1
            if not self.jwks_ok:
                raise httpx.ConnectTimeout("offline")
            return httpx.Response(200, json=JWKS, headers={"cache-control": "public, max-age=3600"})
        if request.url.host == "127.0.0.1" and request.url.path == "/api/chat":
            if not self.ollama_up:
                raise httpx.ConnectError("down")
            body = json.loads(request.content)
            self.llm_requests.append(body)
            reply = self.llm_replies.pop(0) if self.llm_replies else {}
            content = reply if isinstance(reply, str) else json.dumps(reply)
            return httpx.Response(200, json={"message": {"role": "assistant", "content": content}})
        if request.url.host == "127.0.0.1" and request.url.path == "/api/ps":
            if not self.ollama_up:
                raise httpx.ConnectError("down")
            models = [{"name": "gemma4:e2b", "model": "gemma4:e2b"}] if self.model_loaded else []
            return httpx.Response(200, json={"models": models})
        if request.url.host == "api.open-meteo.com":
            return httpx.Response(200, json=self.forecast) if self.weather_ok else httpx.Response(500)
        if request.url.host == "geocoding-api.open-meteo.com":
            name = request.url.params.get("name")
            if name in GEO:
                lat, lon, district = GEO[name]
                return httpx.Response(200, json={"results": [{"name": name, "latitude": lat, "longitude": lon,
                                                              "admin1": "Maharashtra", "admin2": district}]})
            return httpx.Response(200, json={})
        if request.url.host == "api.data.gov.in":
            if not self.mandi_ok:
                return httpx.Response(503)
            commodity = request.url.params.get("filters[commodity]")
            return httpx.Response(200, json={"records": mandi_records(commodity)})
        if request.url.host == "www.msamb.com":
            return self._msamb(request)
        if request.url.host == "sync.test.on.aws":
            return self._sync(request)
        return httpx.Response(404)

    def _sync(self, request: httpx.Request) -> httpx.Response:
        """The real aws/sync_lambda.py behind a fake Function URL."""
        if not self.sync_up:
            raise httpx.ConnectError("offline")
        self.sync_bodies.append(json.loads(request.content))
        ev = {"requestContext": {"http": {"method": request.method}},
              "headers": {k.lower(): v for k, v in request.headers.items()},
              "body": request.content.decode(), "isBase64Encoded": False}
        out = self.sync_lambda.handler(ev, None)
        return httpx.Response(out["statusCode"], content=out["body"], headers=out["headers"])

    def _msamb(self, request: httpx.Request) -> httpx.Response:
        """Fake MSAMB: the grid needs the page's session cookie and starts in Marathi."""
        self.msamb_calls.append(request.url.path)
        if not self.mandi_ok:
            return httpx.Response(503)
        if request.url.path == "/ApmcDetail/APMCPriceInformation":
            return httpx.Response(200, text="<html></html>", headers={"set-cookie": "ASP.NET_SessionId=s1; path=/"})
        if request.url.path == "/ApmcDetail/Profile":
            return httpx.Response(200, text="<html></html>", headers={"set-cookie": "ASP.NET_SessionId=s1; path=/"})
        if request.url.path == "/ApmcDetail/GetDistrictForAPMCProfile":
            return httpx.Response(200, json=[
                {"DistrictNameE": "NASIK", "ApmcList": [{"ApmcNameE": "Lasalgaon"}, {"ApmcNameE": "Yeola"}]},
                {"DistrictNameE": "PUNE", "ApmcList": [{"ApmcNameE": "Pune"}]},
            ])
        if request.url.path == "/Home/ChangeLanguage":
            self.msamb_english = not self.msamb_english
            return httpx.Response(200, text="ok")
        if request.url.path == "/ApmcDetail/DataGridBind":
            if "ASP.NET_SessionId=s1" not in request.headers.get("cookie", ""):
                return httpx.Response(200, text="")  # what the real site does without a session
            return httpx.Response(200, text=msamb_grid(english=self.msamb_english))
        return httpx.Response(404)


class FakeSTT:
    def __init__(self):
        self.text = "आज कांद्याचा भाव काय आहे?"
        self.calls = 0

    async def load(self):
        return None

    async def transcribe(self, audio_bytes: bytes, lang: str, hints: list[str] | None = None) -> str:
        self.calls += 1
        self.hints = hints
        return self.text


def make_settings(tmp_path, **overrides) -> Settings:
    base = dict(
        env="test", firebase_project_id=PROJECT, data_dir=tmp_path,
        data_key=base64.b64encode(b"k" * 32).decode(), data_gov_in_api_key="test-key",
        rate_limit_rps=1000, rate_limit_burst=1000, cors_origins=["http://localhost:5173"],
        frontend_dist=tmp_path / "no-frontend-build",  # tests never serve the real build
    )
    base.update(overrides)
    return Settings(_env_file=None, **base)


@pytest.fixture
def net():
    return FakeNet()


@pytest.fixture
def stt():
    return FakeSTT()


@pytest.fixture
def make_client(tmp_path, net, stt):
    clients = []

    def _make(**overrides) -> TestClient:
        settings = make_settings(tmp_path, **overrides)
        http = httpx.AsyncClient(transport=httpx.MockTransport(net.handle))
        app = create_app(settings, http=http, stt=stt, warm_up=False)
        c = TestClient(app)
        c.__enter__()
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture(autouse=True)
def _reset_caches():
    """Module-level caches must not leak between tests."""
    from app.services import mandi, weather
    weather._cache._data.clear()
    mandi._fetch_cache._data.clear()
    yield


PROFILE = {
    "name": "Ramesh Patil", "lang": "mr", "village": "Niphad", "district": "Nashik", "state": "Maharashtra",
    "lat": 20.0812, "lon": 74.1149, "crops": ["onion", "grapes"], "landAcres": 2.5, "soilType": "black",
    "irrigation": "drip", "tankSizeLitres": 15, "consentAt": "2026-10-01T06:30:00.000Z",
}
