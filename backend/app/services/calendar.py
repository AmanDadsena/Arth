"""Crop calendar, worked out from today's date and the farm's location.

- The season is today's season unless the farmer browses another one.
- Kharif windows follow THIS district's monsoon onset from 40 years of IMD
  rainfall (services/farm.py), the correction Rutu is built on; rabi and summer
  windows stay calendar dates (residual moisture and well water, not rain).
- Every window says where today sits in it: open (days left) or upcoming.
- "In your field now": each of the farmer's crops and its usual stage today
  (data/crop_stages.json).
- "Why now" lines come from the live forecast, live mandi prices and the
  district's Soil Health Card results. No model call, no invented news.
"""

import asyncio
import json
from datetime import date, timedelta
from functools import cache
from pathlib import Path

from ..errors import ApiError
from ..schemas import (
    CalendarResponse,
    CropRecommendation,
    FieldCrop,
    Irrigation,
    Lang,
    MandiPrices,
    Season,
    SeasonNow,
    SeasonSpan,
    SoilType,
    SowingWindow,
    StageSpan,
    TimelineWeek,
    WeatherDay,
    WhyNow,
    WindowStatus,
)
from . import farm, weather
from .mandi import COMMODITY_NAMES
from .names import crop_name

DATA = Path(__file__).resolve().parent.parent / "data" / "crops.json"
STAGES = Path(__file__).resolve().parent.parent / "data" / "crop_stages.json"
LEVELS = ["low", "medium", "high"]

# Sowing seasons as the app uses them (see current_season); MM-DD, end inclusive.
SPANS: dict[Season, tuple[str, str]] = {"kharif": ("06-01", "09-30"), "rabi": ("10-01", "01-31"),
                                       "zaid": ("02-01", "05-31")}
ORDER: list[Season] = ["kharif", "rabi", "zaid"]
SEASON_NAMES = {
    "kharif": {"en": "Kharif", "hi": "खरीफ", "mr": "खरीप"},
    "rabi": {"en": "Rabi", "hi": "रबी", "mr": "रब्बी"},
    "zaid": {"en": "Summer", "hi": "ज़ायद", "mr": "उन्हाळी"},
}
_MONTHS = {
    "en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
    "hi": ("जन", "फ़र", "मार्च", "अप्रै", "मई", "जून", "जुला", "अग", "सित", "अक्टू", "नव", "दिस"),
    "mr": ("जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"),
}


def short_date(d: date | str, lang: Lang) -> str:
    """'2026-11-15' -> '15 Nov' / '15 नव' / '15 नोव्हें'."""
    d = date.fromisoformat(d) if isinstance(d, str) else d
    return f"{d.day} {_MONTHS[lang][d.month - 1]}"


@cache
def _load() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))["seasons"]


@cache
def _stages() -> dict:
    return json.loads(STAGES.read_text(encoding="utf-8"))["crops"]


def suitability(base: str, crop_soils: list[str], water: str, soil: SoilType | None,
                irrigation: Irrigation | None) -> str:
    level = LEVELS.index(base)
    if soil is not None and soil not in crop_soils:
        level -= 1
    if irrigation == "rainfed":
        level -= {"low": 0, "medium": 1, "high": 2}[water]
    return LEVELS[max(level, 0)]


def next_window(mm_dd_from: str, mm_dd_to: str, today: date) -> tuple[date, date]:
    """The next sowing window that hasn't ended yet (handles windows crossing new year)."""
    # Start from last year: on 5 Jan a "15 Dec – 15 Jan" window is still open.
    for year in (today.year - 1, today.year, today.year + 1):
        start = date.fromisoformat(f"{year}-{mm_dd_from}")
        end = date.fromisoformat(f"{year}-{mm_dd_to}")
        if end < start:
            end = end.replace(year=year + 1)
        if end >= today:
            return start, end
    raise AssertionError("unreachable")


def onset_window(offsets: list[int], onset_doy: float, today: date) -> tuple[date, date]:
    """A kharif window `offsets` days after the district's expected onset, next one not yet ended."""
    for year in (today.year, today.year + 1):
        base = date(year, 1, 1) + timedelta(days=round(onset_doy) - 1)
        start, end = base + timedelta(days=offsets[0]), base + timedelta(days=offsets[1])
        if end >= today:
            return start, end
    raise AssertionError("unreachable")


def window_status(start: date, end: date, today: date) -> WindowStatus:
    if start <= today <= end:
        return WindowStatus(phase="open", days=(end - today).days)
    return WindowStatus(phase="upcoming", days=(start - today).days)


def current_season(today: date) -> Season:
    """Kharif sown Jun–Sep, rabi Oct–Jan, zaid Feb–May."""
    m = today.month
    if 6 <= m <= 9:
        return "kharif"
    if m >= 10 or m == 1:
        return "rabi"
    return "zaid"


def _span_dates(season: Season, today: date) -> tuple[date, date]:
    """The span of `season` that contains today, or the next one."""
    return next_window(*SPANS[season], today)


def season_now(today: date, lang: Lang) -> SeasonNow:
    s = current_season(today)
    start, end = _span_dates(s, today)
    nxt = ORDER[(ORDER.index(s) + 1) % 3]
    total = (end - start).days + 1
    return SeasonNow(season=s, name=SEASON_NAMES[s][lang], progress=round(((today - start).days + 0.5) / total, 3),
                     days_left=(end - today).days, next_season=nxt, next_starts=(end + timedelta(days=1)).isoformat())


def season_spans(lang: Lang) -> list[SeasonSpan]:
    return [SeasonSpan(season=s, name=SEASON_NAMES[s][lang], start=SPANS[s][0], end=SPANS[s][1]) for s in ORDER]


def _stage_bounds(mm_from: str, mm_to: str, today: date) -> tuple[date, date] | None:
    """The occurrence of a MM-DD stage that contains today, if any."""
    for year in (today.year - 1, today.year):
        start = date.fromisoformat(f"{year}-{mm_from}")
        end = date.fromisoformat(f"{year}-{mm_to}")
        if end < start:
            end = end.replace(year=year + 1)
        if start <= today <= end:
            return start, end
    return None


def field_stage(crop: str, today: date, lang: Lang) -> FieldCrop | None:
    stages = _stages().get(crop, [])
    year = [StageSpan(start=st["from"], end=st["to"], phase=st["phase"], name=st["stage"][lang]) for st in stages]
    for st in stages:
        bounds = _stage_bounds(st["from"], st["to"], today)
        if bounds:
            start, end = bounds
            span = max((end - start).days, 1)
            return FieldCrop(crop=crop, name=crop_name(crop, lang, capital=True), phase=st["phase"],
                             stage=st["stage"][lang], task=st["task"][lang], stage_from=start.isoformat(),
                             stage_to=end.isoformat(), progress=round((today - start).days / span, 3), year=year)
    return None


def in_field(crops: list[str], today: date, lang: Lang) -> list[FieldCrop]:
    return [f for c in crops if (f := field_stage(c, today, lang))]


def recommend(season: Season, lang: Lang, soil: SoilType | None, irrigation: Irrigation | None,
              today: date | None = None, district: dict | None = None) -> CalendarResponse:
    today = today or date.today()
    onset_doy = farm.onset_doy(district)
    recs = []
    for c in _load()[season]:
        if c.get("onset") and onset_doy is not None:
            start, end = onset_window(c["onset"], onset_doy, today)
            basis = "onset"
        else:
            start, end = next_window(c["from"], c["to"], today)
            basis = "calendar"
        recs.append(CropRecommendation(
            crop=c["crop"],
            name=c["name"][lang],
            suitability=suitability(c["base"], c["soils"], c["water"], soil, irrigation),
            sowing_window=SowingWindow(**{"from": start.isoformat(), "to": end.isoformat()}),
            window_basis=basis,
            status=window_status(start, end, today),
            duration_days=c["durationDays"],
            why=c["why"][lang],
            timeline=[
                TimelineWeek(week=i * 2 + 1, title=w["title"][lang], tasks=[t[lang] for t in w["tasks"]])
                for i, w in enumerate(c["timeline"])
            ],
        ))
    # best fit first; among equals, the window that is open (or opens soonest)
    recs.sort(key=lambda r: (-LEVELS.index(r.suitability), r.status.phase != "open", r.status.days))
    return CalendarResponse(season=season, today=today.isoformat(), current_season=current_season(today),
                            recommendations=recs)


# ---- why now: live weather, live prices, district soil ---------------------------

_WHY = {
    "rain_good": {"en": "{mm} mm of rain forecast this week: good moisture for sowing.",
                  "hi": "इस हफ्ते {mm} मिमी बारिश का अनुमान: बुवाई के लिए अच्छी नमी।",
                  "mr": "या आठवड्यात {mm} मिमी पावसाचा अंदाज: पेरणीसाठी चांगली ओल."},
    "dry_rabi": {"en": "Dry week ahead: sow soon, while the soil still holds the monsoon moisture.",
                 "hi": "आगे सूखा हफ्ता: मिट्टी में मानसून की नमी रहते जल्दी बोएँ।",
                 "mr": "पुढचा आठवडा कोरडा: जमिनीत पावसाची ओल आहे तोवर लवकर पेरा."},
    "dry": {"en": "Dry week ahead: sow only where you can give water.",
            "hi": "आगे सूखा हफ्ता: वहीं बोएँ जहाँ पानी दे सकें।",
            "mr": "पुढचा आठवडा कोरडा: पाणी देता येईल तिथेच पेरा."},
    "hot": {"en": "Hot days up to {t}°C: water right after sowing.",
            "hi": "{t}°C तक गर्म दिन: बुवाई के तुरंत बाद पानी दें।",
            "mr": "{t}°C पर्यंत उष्ण दिवस: पेरणीनंतर लगेच पाणी द्या."},
    "cool": {"en": "Nights down to {t}°C: the cool weather this crop likes.",
             "hi": "रातें {t}°C तक ठंडी: यह फसल ऐसी ठंड पसंद करती है।",
             "mr": "रात्री {t}°C पर्यंत थंड: या पिकाला असा गारवा मानवतो."},
    "price": {"en": "{c} ₹{p}/quintal at {m}, {dir} {x}% this week.",
              "hi": "{m} में {c} ₹{p}/क्विंटल, इस हफ्ते {x}% {dir}।",
              "mr": "{m} ला {c} ₹{p}/क्विंटल, या आठवड्यात {x}% {dir}."},
    "up": {"en": "up", "hi": "बढ़ा", "mr": "वाढ"},
    "down": {"en": "down", "hi": "घटा", "mr": "घट"},
    "legume": {"en": "{p}% of fields in {d} are low in nitrogen; this pulse puts nitrogen back for the next crop.",
               "hi": "{d} के {p}% खेतों में नाइट्रोजन कम है; यह दलहन अगली फसल के लिए नाइट्रोजन लौटाती है।",
               "mr": "{d} मधील {p}% शेतांत नत्र कमी आहे; हे कडधान्य पुढच्या पिकासाठी नत्र परत देते."},
    "onset": {"en": "Window set by the monsoon onset in {d} (expected {when}), not the old fixed date.",
              "hi": "खिड़की {d} के मानसून आगमन (अनुमान {when}) से तय, पुरानी तारीख से नहीं।",
              "mr": "ही वेळ {d} मधील मान्सूनच्या आगमनावरून (अंदाज {when}), जुन्या तारखेवरून नाही."},
}
COOL_CROPS = {"wheat", "gram", "potato", "onion"}


def _weather_lines(rec: CropRecommendation, days: list[WeatherDay], season: Season, lang: Lang) -> list[str]:
    if not days or rec.status is None or rec.status.phase != "open":
        return []
    week = days[:7]
    rain = round(sum(d.rain_mm for d in week))
    hot = max(d.max_c for d in week)
    cool = min(d.min_c for d in week)
    out = []
    if rain >= 25:
        out.append(_WHY["rain_good"][lang].format(mm=rain))
    elif rain < 5:
        out.append(_WHY["dry_rabi" if season == "rabi" else "dry"][lang])
    if hot >= 36:
        out.append(_WHY["hot"][lang].format(t=round(hot)))
    elif rec.crop in COOL_CROPS and cool <= 17:
        out.append(_WHY["cool"][lang].format(t=round(cool)))
    return out


def _market_line(rec: CropRecommendation, prices: MandiPrices | None, lang: Lang) -> list[str]:
    if prices is None or not prices.markets:
        return []
    near = next((m for m in prices.markets if m.market == prices.trend_market), prices.markets[0])
    x = prices.change_pct7d
    if abs(x) < 0.5:
        return []
    return [_WHY["price"][lang].format(c=crop_name(rec.crop, lang, capital=True), p=f"{near.modal_price:,}",
                                       m=near.market, x=abs(round(x, 1)), dir=_WHY["up" if x > 0 else "down"][lang])]


def _soil_lines(rec: CropRecommendation, district: dict | None, lang: Lang) -> list[str]:
    out = []
    crop = next((c for s in _load().values() for c in s if c["crop"] == rec.crop), {})
    n_low = farm.nitrogen_low_share(district)
    name = (district or {}).get("en" if lang == "en" else "dev", "")
    if crop.get("legume") and n_low is not None and n_low >= 0.5:
        out.append(_WHY["legume"][lang].format(p=round(n_low * 100), d=name))
    if rec.window_basis == "onset" and district and district.get("onset"):
        expected = farm.onset(district, date.fromisoformat(rec.sowing_window.from_).year)
        out.append(_WHY["onset"][lang].format(d=name, when=short_date(expected.expected, lang)))
    return out


async def build(*, http, mandi, profile: dict, season: Season | None, lang: Lang, timeout: float,
                today: date | None = None) -> CalendarResponse:
    today = today or weather.today_ist()
    district = farm.locate(profile.get("lat"), profile.get("lon"), profile.get("district"))
    season = season or current_season(today)
    cal = recommend(season, lang, profile.get("soilType"), profile.get("irrigation"), today, district)
    cal.season_now = season_now(today, lang)
    cal.seasons = season_spans(lang)
    cal.onset = farm.onset(district, today.year if today.month < 11 else today.year + 1)
    cal.in_field = in_field(profile.get("crops", []), today, lang)

    async def safe(coro):
        try:
            return await coro
        except ApiError:
            return None

    lat, lon = profile.get("lat"), profile.get("lon")
    priced = [r.crop for r in cal.recommendations[:4] if r.crop in COMMODITY_NAMES]
    tasks = [safe(weather.get_raw(http, lat, lon, timeout))] if lat is not None else []
    tasks += [safe(mandi.prices(c, lat, lon)) for c in priced] if lat is not None else []
    results = await asyncio.gather(*tasks)
    raw = results[0] if results else None
    days = weather.parse_days(raw) if raw else []
    prices = dict(zip(priced, results[1:], strict=False))

    for r in cal.recommendations:
        why = WhyNow(weather=_weather_lines(r, days, season, lang), market=_market_line(r, prices.get(r.crop), lang),
                     soil=_soil_lines(r, district, lang))
        r.why_now = why if (why.weather or why.market or why.soil) else None
    return cal
