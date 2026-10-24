"""'Why sow this crop now' for the crop calendar (docs/SPEC.md: CropRecommendation.whyNow).

A line-by-line port of frontend/src/mocks/calendarInsights.ts, so signed-in
farmers see the same signals demo mode shows:
- weather: rain band and temperature fit from the live 7-day forecast,
- market: the live 7-day mandi change plus curated, dated facts (MSP decisions),
- news: curated, dated, sourced headlines.

The curated tables live in data/insights.json, exported from that file, so the
facts and source links stay identical. No model call: these are rules over data.
"""

import json
import math
from datetime import date
from functools import cache
from pathlib import Path

from ..schemas import Lang, NewsItem, Season, WeatherDay, WhyNow

DATA = Path(__file__).resolve().parent.parent / "data" / "insights.json"

# Short month names exactly as en-IN / hi-IN / mr-IN Intl.DateTimeFormat prints them
# (taken from Node 24's ICU, which matches Chrome; the golden test checks this).
_MONTHS = {
    "en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"),
    "hi": ("जन॰", "फ़र॰", "मार्च", "अप्रैल", "मई", "जून", "जुल॰", "अग॰", "सित॰", "अक्टू॰", "नव॰", "दिस॰"),
    "mr": ("जाने", "फेब्रु", "मार्च", "एप्रि", "मे", "जून", "जुलै", "ऑग", "सप्टें", "ऑक्टो", "नोव्हें", "डिसें"),
}


@cache
def _data() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def _round(x: float) -> int:
    """JavaScript Math.round (halves round up), not Python's banker's rounding."""
    return math.floor(x + 0.5)


def _fill(template: str, **values) -> str:
    out = template
    for k, v in values.items():
        out = out.replace("{" + k + "}", str(v))
    return out


def _short_date(iso: str, lang: Lang) -> str:
    try:
        d = date.fromisoformat(iso)
    except ValueError:
        return iso
    return f"{d.day} {_MONTHS[lang][d.month - 1]}"


def _next_days(forecast: list[WeatherDay], today: date, n: int = 7) -> list[WeatherDay]:
    t = today.isoformat()
    ahead = [d for d in forecast if d.date[:10] >= t]
    return (ahead or forecast)[:n]


def weather_lines(crop: str, lang: Lang, forecast: list[WeatherDay], today: date) -> list[str]:
    data = _data()
    facts = data["crops"].get(crop)
    if not facts or today.month not in facts["sowMonths"]:
        return []  # months away from sowing, this week's weather says nothing about the crop
    days = _next_days(forecast, today)
    if not days:
        return []
    name = facts["name"][lang]
    rains = [max(0.0, d.rain_mm) for d in days]
    total = _round(sum(rains))
    lines: list[str] = []

    # a single heavy day in the next 5 days decides the advice
    heavy = next((i for i, mm in enumerate(rains[:5]) if mm >= 25), None)
    if heavy is not None:
        lines.append(_fill(data["heavy"][lang], mm=_round(rains[heavy]),
                           date=_short_date(days[heavy].date[:10], lang), crop=name))
    else:
        band = "dry" if total < 5 else "light" if total < 30 else "good" if total < 100 else "wet"
        lines.append(_fill(data["rain"][facts["water"]][band][lang], mm=total, n=len(days), crop=name))

    mx = _round(sum(d.max_c for d in days) / len(days))
    mn = _round(sum(d.min_c for d in days) / len(days))
    lo, hi = facts["germC"]
    mean = (mx + mn) / 2
    kind = "warm" if mean > hi else "cool" if mean < lo else "fit"
    hint = (facts.get("warmHint") or data["warmHint"])[lang] if kind == "warm" else data["coolHint"][lang]
    lines.append(_fill(data["temp"][kind][lang], max=mx, min=mn, lo=lo, hi=hi, crop=name, hint=hint))
    return lines[:3]


def price_line(crop: str, lang: Lang, change_pct: float | None) -> str | None:
    if change_pct is None or not math.isfinite(change_pct):
        return None
    data = _data()
    name = data["crops"][crop]["name"][lang] if crop in data["crops"] else crop
    direction = "up" if change_pct >= 0.5 else "down" if change_pct <= -0.5 else "flat"
    signed = ("+" if change_pct > 0 else "") + f"{change_pct:.1f}"
    shown = signed if direction == "flat" else f"{abs(change_pct):.1f}"
    crop_name = name[:1].upper() + name[1:] if lang == "en" else name
    return _fill(data["price"][direction][lang], Crop=crop_name, pct=shown)


def market_lines(crop: str, season: Season, lang: Lang, change_pct: float | None, today: date) -> list[str]:
    t = today.isoformat()
    live = price_line(crop, lang, change_pct)
    facts = [f["text"][lang] for f in _data()["market"].get(season, {}).get(crop, []) if f["date"] <= t]
    return (([live] if live else []) + facts)[:3]


def news_for(crop: str, season: Season, lang: Lang, today: date) -> list[NewsItem]:
    t = today.isoformat()
    seeds = [n for n in _data()["news"].get(season, {}).get(crop, []) if n["date"] <= t]
    seeds.sort(key=lambda n: n["date"], reverse=True)
    return [NewsItem(headline=n["headline"][lang], source=n["source"], url=n["url"], date=n["date"])
            for n in seeds[:3]]


def why_now(crop: str, season: Season, lang: Lang, forecast: list[WeatherDay],
            price_change_pct: dict[str, float], today: date) -> WhyNow:
    return WhyNow(
        weather=weather_lines(crop, lang, forecast, today),
        market=market_lines(crop, season, lang, price_change_pct.get(crop), today),
        news=news_for(crop, season, lang, today),
    )
