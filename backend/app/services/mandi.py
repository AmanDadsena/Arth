"""Mandi prices and sell advice.

Sources, in order: Agmarknet daily prices on data.gov.in when an API key is
configured; otherwise the Maharashtra State Agricultural Marketing Board's
public APMC price grid (msamb.com), which needs no key and carries the last 7
days for every APMC in the state.

- Every fetch is stored in SQLite, so the 30-day trend builds up over time
  and prices still show when the internet is down.
- Market locations come from the Open-Meteo geocoder (cached), so distances
  are computed, never invented.
- Sell advice is arithmetic: price x quantity - transport. The model only
  explains the result in the farmer's language.
"""

import asyncio
import difflib
import logging
import math
import re
from datetime import date, datetime, timedelta

import httpx

from ..db import Database
from ..errors import ApiError
from ..schemas import MandiPrices, MarketPrice, PricePoint, SellAdvice, SellOption
from .cache import TTLCache

log = logging.getLogger("arth.mandi")

DATA_GOV_URL = "https://api.data.gov.in/resource/{rid}"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
MAX_DISTANCE_KM = 250
ROAD_FACTOR = 1.3  # straight-line km -> rough road km

# App commodity id -> Agmarknet commodity name.
COMMODITY_NAMES = {
    "onion": "Onion",
    "tomato": "Tomato",
    "potato": "Potato",
    "grapes": "Grapes",
    "soybean": "Soyabean",
    "wheat": "Wheat",
    "gram": "Bengal Gram(Gram)(Whole)",
    "cotton": "Cotton",
    "pomegranate": "Pomegranate",
    "maize": "Maize",
    "sugarcane": "Sugarcane",
    "jowar": "Jowar(Sorghum)",
    "bajra": "Bajra(Pearl Millet/Cumbu)",
    "tur": "Arhar (Tur/Red Gram)(Whole)",
}
PERISHABLE = {"tomato", "grapes"}

# App commodity id -> MSAMB commodity code (from the <select id="drpCommodities"> on its price page).
MSAMB_CODES = {
    "onion": "08035",
    "tomato": "08071",
    "potato": "08007",
    "grapes": "07008",
    "soybean": "04017",
    "wheat": "02009",
    "gram": "03006",
    "cotton": "01001",
    "pomegranate": "07007",
    "maize": "02015",
    "sugarcane": "06003",
    "jowar": "02011",
    "bajra": "02002",
    "tur": "03020",
}
MSAMB_BASE = "https://www.msamb.com"
MSAMB_PAGE = MSAMB_BASE + "/ApmcDetail/APMCPriceInformation"
_DEVANAGARI = re.compile("[ऀ-ॿ]")  # Devanagari block: the grid came back in Marathi
_TAG = re.compile(r"<[^>]+>")

_fetch_cache: TTLCache[int] = TTLCache(ttl_s=60 * 60)
_apmc_cache: TTLCache[dict] = TTLCache(ttl_s=7 * 24 * 60 * 60)


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def _to_int(v) -> int | None:
    try:
        n = float(str(v).replace(",", ""))
    except ValueError:
        return None
    return round(n) if n > 0 else None


def parse_records(records: list[dict], state: str, commodity_name: str) -> list[dict]:
    """Normalise data.gov.in rows; drop anything incomplete or for another state/commodity."""
    rows = []
    for rec in records:
        r = {k.lower(): v for k, v in rec.items()}
        if str(r.get("state", "")).strip().lower() != state.lower():
            continue
        if str(r.get("commodity", "")).strip().lower() != commodity_name.lower():
            continue
        try:
            day = datetime.strptime(str(r.get("arrival_date", "")).strip(), "%d/%m/%Y").date()
        except ValueError:
            continue
        lo, hi, modal = _to_int(r.get("min_price")), _to_int(r.get("max_price")), _to_int(r.get("modal_price"))
        market = str(r.get("market", "")).strip()
        if not (market and lo and hi and modal):
            continue
        rows.append({
            "market": market[:80],
            "district": str(r.get("district", "")).strip()[:80],
            "arrival_date": day.isoformat(),
            "min_price": lo, "max_price": hi, "modal_price": modal,
        })
    return rows


# MSAMB uses current district names; the geocoder (GeoNames) often has the older ones.
_DISTRICT_ALIASES = {
    "ahilyanagar": {"ahmadnagar", "ahmednagar"},
    "chhatrapati sambhajinagar": {"aurangabad"},
    "dharashiv": {"osmanabad"},
    "yewatmal": {"yavatmal"},
    "nasik": {"nashik"},
    "beed": {"bid"},
    "buldhana": {"buldana"},
    "raigad": {"raigarh"},
    "gondiya": {"gondia"},
    "mumbai": {"mumbai suburban", "mumbai city"},
}


def district_names(district: str) -> set[str]:
    d = " ".join(district.lower().split())
    return {d} | _DISTRICT_ALIASES.get(d, set())


def _letters(s: str) -> str:
    return re.sub(r"[^A-Z]", "", s.upper())


def apmc_district_index(profile_json: list[dict]) -> dict[str, list[tuple[str, str]]]:
    """MSAMB's district list (GetDistrictForAPMCProfile) -> {APMC base name: [(hint, district)]}.
    'Malegaon(Nashik)' -> base MALEGAON, hint NASHIK."""
    index: dict[str, list[tuple[str, str]]] = {}
    for dist in profile_json:
        name = " ".join(str(dist.get("DistrictNameE", "")).split()).title()
        for apmc in dist.get("ApmcList") or []:
            full = str(apmc.get("ApmcNameE", ""))
            base, _, hint = full.partition("(")
            if _letters(base):
                index.setdefault(_letters(base), []).append((_letters(hint), name))
    return index


def district_for(market: str, index: dict[str, list[tuple[str, str]]]) -> str:
    """District of a grid market like 'Lasalgaon-Vinchur' or 'Karjat (A- Nagar)'; '' if unsure."""
    hint_m = re.search(r"\(([^)]*)\)", market)
    hint = hint_m.group(1) if hint_m else ""
    base = _letters(re.split(r"[(-]", market, maxsplit=1)[0])
    cands = index.get(base)
    if not cands:
        close = difflib.get_close_matches(base, list(index), n=1, cutoff=0.8)  # Sinnar ~ Sinner
        cands = index.get(close[0]) if close else None
    if not cands and len(base) >= 5:  # 'Pimpalgaon (B)' ~ 'Pimpalgaon basawant'
        cands = [c for key, cs in index.items() if key.startswith(base) for c in cs] or None
    if not cands:
        return ""
    districts = {d for _, d in cands}
    if len(districts) == 1:
        return districts.pop()
    h = _letters(hint)
    if h:  # 'Karjat (A- Nagar)' vs 'Karjat(Nager)' / 'Karjat(Raigad)'
        scored = [(difflib.SequenceMatcher(None, h, ch or _letters(d)).ratio(), d) for ch, d in cands]
        score, best = max(scored)
        if score >= 0.6:
            return best
    return ""  # ambiguous (e.g. Malegaon in Nashik and Washim): don't guess


def parse_msamb(html: str) -> list[dict]:
    """MSAMB's commodity grid: a date row (colspan=7) then one row per APMC:
    market, variety, unit, arrivals, min, max, modal. Keeps quintal rows only and,
    where a market lists several varieties on a day, the one with most arrivals."""
    best: dict[tuple[str, str], dict] = {}
    day: str | None = None
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, flags=re.S | re.I):
        cells = [" ".join(_TAG.sub(" ", c).split()) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S | re.I)]
        if len(cells) == 1:
            try:
                day = datetime.strptime(cells[0], "%d/%m/%Y").date().isoformat()
            except ValueError:
                day = None
            continue
        if len(cells) != 7 or day is None or cells[2].upper() != "QUINTAL":
            continue
        market = cells[0].strip(" -")
        arrivals = _to_int(cells[3]) or 0
        lo, hi, modal = _to_int(cells[4]), _to_int(cells[5]), _to_int(cells[6])
        if not (market and lo and hi and modal) or not lo <= modal <= hi:
            continue
        key = (market.upper(), day)
        if key in best and best[key]["_arrivals"] >= arrivals:
            continue
        best[key] = {"market": market.title()[:80], "district": "", "arrival_date": day,
                     "min_price": lo, "max_price": hi, "modal_price": modal, "_arrivals": arrivals}
    return [{k: v for k, v in r.items() if k != "_arrivals"} for r in best.values()]


class MandiService:
    def __init__(self, http: httpx.AsyncClient, db: Database, *, api_key: str, resource_id: str,
                 state: str, rs_per_quintal_km: float, timeout: float):
        self.http, self.db = http, db
        self.api_key, self.resource_id, self.state = api_key, resource_id, state
        self.rate = rs_per_quintal_km
        self.timeout = timeout
        self._geo_sem = asyncio.Semaphore(6)
        self._msamb_lock = asyncio.Lock()  # its language is per session: one fetch at a time
        self._msamb_ready = False  # session cookie set and language switched to English

    # --- upstream ---------------------------------------------------------------

    async def _refresh(self, commodity: str) -> int:
        if not self.api_key:
            return await self._refresh_msamb(commodity)
        name = COMMODITY_NAMES.get(commodity, commodity.title())
        params = {
            "api-key": self.api_key,
            "format": "json",
            "limit": "1000",
            "filters[state.keyword]": self.state,
            "filters[commodity]": name,
        }
        try:
            r = await self.http.get(DATA_GOV_URL.format(rid=self.resource_id), params=params, timeout=self.timeout)
            r.raise_for_status()
            records = r.json().get("records", [])
        except (httpx.HTTPError, ValueError):
            # Never log the URL: it carries the API key.
            log.warning("mandi fetch failed for %s", commodity)
            raise ApiError(503, "mandi_unavailable", "Mandi prices are not available right now.") from None
        rows = parse_records(records, self.state, name)
        if rows:
            self.db.upsert_prices(commodity, rows)
        return len(rows)

    async def _refresh_msamb(self, commodity: str) -> int:
        """Keyless source: MSAMB's public APMC price grid (same request a browser makes)."""
        code = MSAMB_CODES.get(commodity)
        if code is None:
            raise ApiError(404, "no_markets", "No recent prices for this crop near you.")
        headers = {"X-Requested-With": "XMLHttpRequest", "Referer": MSAMB_PAGE}
        grid_url = f"{MSAMB_BASE}/ApmcDetail/DataGridBind"
        params = {"commodityCode": code, "apmcCode": "null"}
        try:
            async with self._msamb_lock:
                html = await self._msamb_grid(grid_url, params, headers)
        except httpx.HTTPError:
            log.warning("msamb fetch failed for %s", commodity)
            raise ApiError(503, "mandi_unavailable", "Mandi prices are not available right now.") from None
        rows = parse_msamb(html)
        index = await self._apmc_index()
        for r in rows:
            r["district"] = district_for(r["market"], index)
        if rows:
            self.db.upsert_prices(commodity, rows)
        return len(rows)

    async def _msamb_grid(self, url: str, params: dict, headers: dict) -> str:
        """One grid request once a session is set up; otherwise set it up first.

        Setting up = load the price page (session cookie) and, if the grid comes back in
        Marathi, toggle the session to English once. Done once per session, so each further
        crop costs a single request (live finding: four crops in a row took 15 s).
        """
        if self._msamb_ready:
            r = await self.http.get(url, params=params, headers=headers, timeout=self.timeout)
            r.raise_for_status()
            if r.text.strip() and not _DEVANAGARI.search(r.text):
                return r.text
            self._msamb_ready = False  # session expired or language reset: set it up again
        (await self.http.get(MSAMB_PAGE, timeout=self.timeout)).raise_for_status()
        r = await self.http.get(url, params=params, headers=headers, timeout=self.timeout)
        r.raise_for_status()
        if _DEVANAGARI.search(r.text):
            await self.http.post(f"{MSAMB_BASE}/Home/ChangeLanguage", headers=headers, timeout=self.timeout)
            r = await self.http.get(url, params=params, headers=headers, timeout=self.timeout)
            r.raise_for_status()
        self._msamb_ready = bool(r.text.strip()) and not _DEVANAGARI.search(r.text)
        return r.text

    async def _apmc_index(self) -> dict[str, list[tuple[str, str]]]:
        """APMC -> district from MSAMB's APMC profile list; cached a week. {} if unavailable."""
        async def load():
            profile = f"{MSAMB_BASE}/ApmcDetail/Profile"
            async with self._msamb_lock:
                (await self.http.get(profile, timeout=self.timeout)).raise_for_status()
                r = await self.http.get(f"{MSAMB_BASE}/ApmcDetail/GetDistrictForAPMCProfile",
                                        headers={"X-Requested-With": "XMLHttpRequest", "Referer": profile},
                                        timeout=self.timeout)
                r.raise_for_status()
                return apmc_district_index(r.json())
        try:
            return await _apmc_cache.get("apmc", load)
        except (httpx.HTTPError, ValueError):
            log.warning("msamb APMC list unavailable; markets geocoded by name only")
            return {}

    async def _ensure_fresh(self, commodity: str) -> None:
        try:
            await _fetch_cache.get(commodity, lambda: self._refresh(commodity))
        except ApiError:
            # Offline or not configured: fall back to whatever is stored.
            if not self.db.latest_prices(commodity, (date.today() - timedelta(days=14)).isoformat()):
                raise

    # --- geocoding --------------------------------------------------------------

    @staticmethod
    def _clean_market(name: str) -> str:
        # "Lasalgaon(Niphad)" -> "Lasalgaon", "Mumbai- Onion Potato Market" -> "Mumbai"
        return re.split(r"[(\-,]", name)[0].strip()

    async def _geocode(self, place: str, district: str) -> tuple[float, float] | None:
        key = f"{place}|{district}".lower()
        known = self.db.get_geocode(key)
        if known is not False:
            return known  # type: ignore[return-value]
        async with self._geo_sem:
            try:
                r = await self.http.get(GEOCODE_URL, params={"name": place, "count": 10, "countryCode": "IN",
                                                             "language": "en"}, timeout=4.0)
                r.raise_for_status()
                results = r.json().get("results") or []
            except (httpx.HTTPError, ValueError):
                return None  # don't cache a network failure
        in_state = [x for x in results if x.get("admin1", "").lower() == self.state.lower()]
        if district:
            # Known district: only a place inside it counts. Same-named villages elsewhere
            # are common (live finding: Shirur APMC, Pune, geocoded to a Shirur village in Nashik).
            names = district_names(district)
            best = next((x for x in in_state if x.get("admin2", "").lower() in names), None)
        else:
            best = in_state[0] if in_state else None
        coords = (best["latitude"], best["longitude"]) if best else None
        self.db.put_geocode(key, coords)
        return coords

    async def _locate(self, market: str, district: str) -> tuple[float, float] | None:
        return await self._geocode(self._clean_market(market), district) or (
            await self._geocode(district, district) if district else None)

    # --- public API -------------------------------------------------------------

    async def prices(self, commodity: str, lat: float, lon: float) -> MandiPrices:
        await self._ensure_fresh(commodity)
        since = (date.today() - timedelta(days=14)).isoformat()
        latest = self.db.latest_prices(commodity, since)
        here = (lat, lon)
        located = await asyncio.gather(*(self._locate(r["market"], r["district"]) for r in latest))
        markets = []
        for r, at in zip(latest, located, strict=True):
            if at is None:
                continue
            km = round(haversine_km(here, at) * ROAD_FACTOR, 1)
            if km > MAX_DISTANCE_KM:
                continue
            markets.append(MarketPrice(market=r["market"], district=r["district"], min_price=r["min_price"],
                                       max_price=r["max_price"], modal_price=r["modal_price"],
                                       distance_km=km, arrival_date=r["arrival_date"]))
        if not markets:
            raise ApiError(404, "no_markets", "No recent prices for this crop near you.")
        # The 12 nearest markets (where a farmer can actually take the crop), best price first.
        # Sorting only by price let far markets crowd out the farmer's own (live finding:
        # Yeola, 40 km from Niphad, was dropped for Shirpur, 211 km away).
        markets = sorted(markets, key=lambda m: m.distance_km)[:12]
        markets.sort(key=lambda m: -m.modal_price)

        # Trend for the nearest market (where a farmer would usually sell).
        nearest = min(markets, key=lambda m: m.distance_km)
        series = self.db.price_series(commodity, nearest.market, (date.today() - timedelta(days=30)).isoformat())
        trend = [PricePoint(date=s["arrival_date"], modal_price=s["modal_price"]) for s in series]
        return MandiPrices(
            commodity=commodity,
            as_of=max(m.arrival_date for m in markets),
            markets=markets,
            trend=trend,
            trend_market=nearest.market,
            change_pct7d=change_pct(trend, days=7),
        )

    def sell_options(self, prices: MandiPrices, quantity: float) -> list[SellOption]:
        options = []
        for m in prices.markets:
            transport = round(m.distance_km * self.rate * quantity)
            options.append(SellOption(market=m.market, modal_price=m.modal_price, distance_km=m.distance_km,
                                      transport_cost=transport,
                                      net_earning=round(m.modal_price * quantity) - transport))
        options.sort(key=lambda o: -o.net_earning)
        return options


def change_pct(trend: list[PricePoint], days: int) -> float:
    if len(trend) < 2:
        return 0.0
    last = trend[-1]
    cutoff = date.fromisoformat(last.date) - timedelta(days=days)
    base = next((p for p in trend if date.fromisoformat(p.date) >= cutoff), trend[0])
    if base is last or base.modal_price == 0:
        return 0.0
    return round((last.modal_price - base.modal_price) * 100 / base.modal_price, 1)


def slope_per_day(trend: list[PricePoint], days: int = 7) -> float:
    """Least-squares slope (₹/quintal per day) over the last `days` days."""
    if len(trend) < 3:
        return 0.0
    end = date.fromisoformat(trend[-1].date)
    pts = [((date.fromisoformat(p.date) - end).days, p.modal_price) for p in trend
           if (end - date.fromisoformat(p.date)).days <= days]
    if len(pts) < 3:
        return 0.0
    n = len(pts)
    mx = sum(x for x, _ in pts) / n
    my = sum(y for _, y in pts) / n
    var = sum((x - mx) ** 2 for x, _ in pts)
    if var == 0:
        return 0.0
    return round(sum((x - mx) * (y - my) for x, y in pts) / var, 1)


def recommend(commodity: str, best_price: int, slope: float) -> str:
    """WAIT only when prices are clearly rising (>0.5% a day) and the crop keeps."""
    if commodity in PERISHABLE or best_price <= 0:
        return "SELL_NOW"
    return "WAIT" if slope > 0.005 * best_price else "SELL_NOW"


def advice(options: list[SellOption], commodity: str, slope: float, reasoning: str) -> SellAdvice:
    best = options[0]
    return SellAdvice(recommendation=recommend(commodity, best.modal_price, slope),  # type: ignore[arg-type]
                      best_market=best.market, net_earning=best.net_earning, options=options,
                      trend_slope=slope, reasoning=reasoning)
