"""Mandi prices (Agmarknet daily prices on data.gov.in) and sell advice.

- Every fetch is stored in SQLite, so the 30-day trend builds up over time
  and prices still show when the internet is down.
- Market locations come from the Open-Meteo geocoder (cached), so distances
  are computed, never invented.
- Sell advice is arithmetic: price x quantity - transport. The model only
  explains the result in the farmer's language.
"""

import asyncio
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
    "jowar": "Jowar(Sorghum)",
    "bajra": "Bajra(Pearl Millet/Cumbu)",
    "tur": "Arhar (Tur/Red Gram)(Whole)",
}
PERISHABLE = {"tomato", "grapes"}

_fetch_cache: TTLCache[int] = TTLCache(ttl_s=60 * 60)


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


class MandiService:
    def __init__(self, http: httpx.AsyncClient, db: Database, *, api_key: str, resource_id: str,
                 state: str, rs_per_quintal_km: float, timeout: float):
        self.http, self.db = http, db
        self.api_key, self.resource_id, self.state = api_key, resource_id, state
        self.rate = rs_per_quintal_km
        self.timeout = timeout
        self._geo_sem = asyncio.Semaphore(6)

    # --- upstream ---------------------------------------------------------------

    async def _refresh(self, commodity: str) -> int:
        if not self.api_key:
            raise ApiError(503, "mandi_unavailable", "Live mandi prices are not configured.")
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
        best = next((x for x in in_state if district and x.get("admin2", "").lower() == district.lower()),
                    in_state[0] if in_state else None)
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
        markets.sort(key=lambda m: -m.modal_price)

        # Trend for the nearest market (where a farmer would usually sell).
        nearest = min(markets, key=lambda m: m.distance_km)
        series = self.db.price_series(commodity, nearest.market, (date.today() - timedelta(days=30)).isoformat())
        trend = [PricePoint(date=s["arrival_date"], modal_price=s["modal_price"]) for s in series]
        return MandiPrices(
            commodity=commodity,
            as_of=max(m.arrival_date for m in markets),
            markets=markets[:12],
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
