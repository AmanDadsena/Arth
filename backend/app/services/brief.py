"""Home-screen brief ("Aaj ka kaam"): 2–3 actions from weather, mandi, the
crop calendar and the usual stage of the farmer's own crops on today's date.
Every source is optional: if one fails the brief still loads.
Rules pick the actions; no model call, so the home screen opens fast.
"""

import asyncio
import time
from datetime import date

from ..errors import ApiError
from ..schemas import ActionItem, Brief, FieldCrop, Lang, PriceAlert, ToolCallLog, WeatherDay
from . import calendar, farm, weather
from .mandi import MandiService
from .names import crop_name

T = {
    "greet": {"en": "Namaste, {n}", "hi": "नमस्ते {n}", "mr": "नमस्कार {n}"},
    "spray_title": {"en": "Don't spray {when} — {p}% rain", "hi": "{when} छिड़काव न करें — {p}% बारिश",
                    "mr": "{when} फवारणी करू नका — {p}% पाऊस"},
    "spray_detail": {"en": "Spray today if needed, or wait until the leaves are dry after the rain.",
                     "hi": "ज़रूरत हो तो आज छिड़कें, या बारिश के बाद पत्ते सूखने तक रुकें।",
                     "mr": "गरज असल्यास आज फवारणी करा, किंवा पावसानंतर पाने सुकेपर्यंत थांबा."},
    "heat_title": {"en": "Very hot ({t}°C) — irrigate in the evening", "hi": "बहुत गर्मी ({t}°C) — शाम को सिंचाई करें",
                   "mr": "खूप उष्ण ({t}°C) — संध्याकाळी पाणी द्या"},
    "heat_detail": {"en": "Evening water is not lost to the afternoon sun.",
                    "hi": "शाम का पानी दोपहर की धूप में नहीं उड़ता।",
                    "mr": "संध्याकाळचे पाणी दुपारच्या उन्हात उडून जात नाही."},
    "sell_title": {"en": "{c} ₹{p} at {m} — up {d}% this week", "hi": "{m} में {c} ₹{p} — इस हफ्ते {d}% बढ़ा",
                   "mr": "{m} ला {c} ₹{p} — या आठवड्यात {d}% वाढ"},
    "sell_detail": {"en": "Compare markets after transport in Sell Smart.",
                    "hi": "ढुलाई के बाद बाज़ारों की तुलना Sell Smart में देखें।",
                    "mr": "वाहतुकीनंतर बाजारांची तुलना Sell Smart मध्ये पहा."},
    "sow_title": {"en": "Sowing time for {c}: until {to}", "hi": "{c} की बुवाई का समय: {to} तक",
                  "mr": "{c} पेरणीची वेळ: {to} पर्यंत"},
    "sow_detail": {"en": "See the crop calendar for the week-by-week plan.",
                   "hi": "हफ्ते-दर-हफ्ते योजना फसल कैलेंडर में देखें।",
                   "mr": "आठवड्यानुसार नियोजन पीक दिनदर्शिकेत पहा."},
    "field_title": {"en": "{c}: {stage}", "hi": "{c}: {stage}", "mr": "{c}: {stage}"},
}
# what a crop's usual stage today asks of the farmer, as an action
_FIELD_ACTION = {"sow": ("sow", "medium"), "protect": ("protect", "medium"), "harvest": ("harvest", "medium")}
SELL_ALERT_PCT = 3.0
_PRIORITY = {"high": 0, "medium": 1, "low": 2}


async def _timed(log: list[ToolCallLog], name: str, args: dict, coro):
    start = time.perf_counter()
    try:
        return await coro
    except ApiError:
        return None
    finally:
        log.append(ToolCallLog(name=name, args=args, ms=round((time.perf_counter() - start) * 1000)))


def weather_actions(days: list[WeatherDay], lang: Lang) -> list[ActionItem]:
    out = []
    rainy = next((d for d in days[:3] if d.rain_prob > weather.RAIN_NO_SPRAY_PROB), None)
    if rainy:
        when = weather.day_word(rainy.date, days, lang)
        out.append(ActionItem(id=f"spray-{rainy.date}", type="spray", priority="high", source="weather",
                              route="/weather", title=T["spray_title"][lang].format(when=when, p=rainy.rain_prob),
                              detail=T["spray_detail"][lang]))
    hot = next((d for d in days[:3] if d.max_c > weather.HEAT_IRRIGATE_C), None)
    if hot:
        out.append(ActionItem(id=f"heat-{hot.date}", type="irrigate", priority="high", source="weather",
                              route="/weather", title=T["heat_title"][lang].format(t=round(hot.max_c)),
                              detail=T["heat_detail"][lang]))
    return out


async def build(*, http, mandi: MandiService, profile: dict, lang: Lang, timeout: float,
                today: date | None = None) -> Brief:
    today = today or weather.today_ist()
    lat, lon = profile["lat"], profile["lon"]
    crops: list[str] = profile.get("crops", [])[:3]
    tools: list[ToolCallLog] = []

    weather_task = _timed(tools, "get_weather", {"district": profile.get("district"), "days": 4},
                          weather.get_raw(http, lat, lon, timeout))
    price_tasks = [_timed(tools, "get_mandi_prices", {"commodity": c}, mandi.prices(c, lat, lon)) for c in crops]
    raw_weather, *prices = await asyncio.gather(weather_task, *price_tasks)

    days = weather.parse_days(raw_weather)[:4] if raw_weather else []
    current = weather.current(raw_weather) if raw_weather else None
    actions = weather_actions(days, lang)

    # the farmer's own crops, where they usually stand today
    field: list[FieldCrop] = calendar.in_field(profile.get("crops", []), today, lang)
    for f in field:
        if f.phase in _FIELD_ACTION:
            kind, prio = _FIELD_ACTION[f.phase]
            actions.append(ActionItem(id=f"field-{f.crop}", type=kind, priority=prio, source="calendar",
                                      route="/calendar", title=T["field_title"][lang].format(c=f.name, stage=f.stage),
                                      detail=f.task))

    alerts: list[PriceAlert] = []
    for crop, p in zip(crops, prices, strict=True):
        if p is None:
            continue
        near = next(m for m in p.markets if m.market == p.trend_market)
        direction = "up" if p.change_pct7d > 0.5 else "down" if p.change_pct7d < -0.5 else "flat"
        alerts.append(PriceAlert(commodity=crop, market=near.market, modal_price=near.modal_price,
                                 change_pct=p.change_pct7d, direction=direction))
        if p.change_pct7d >= SELL_ALERT_PCT:
            actions.append(ActionItem(
                id=f"sell-{crop}", type="sell", priority="medium", source="mandi", route="/mandi",
                title=T["sell_title"][lang].format(c=crop_name(crop, lang), p=near.modal_price, m=near.market,
                                                   d=p.change_pct7d),
                detail=T["sell_detail"][lang]))

    season = calendar.current_season(today)
    start = time.perf_counter()
    district = farm.locate(lat, lon, profile.get("district"))
    cal = calendar.recommend(season, lang, profile.get("soilType"), profile.get("irrigation"), today, district)
    tools.append(ToolCallLog(name="get_crop_calendar", args={"season": season},
                             ms=round((time.perf_counter() - start) * 1000)))
    sowable = [r for r in cal.recommendations
               if r.suitability == "high" and r.status and r.status.phase == "open" and r.crop not in crops]
    if sowable:
        r = sowable[0]
        until = calendar.short_date(r.sowing_window.to, lang)
        actions.append(ActionItem(id=f"sow-{r.crop}", type="sow", priority="low", source="calendar",
                                  route="/calendar",
                                  title=T["sow_title"][lang].format(c=r.name, to=until),
                                  detail=T["sow_detail"][lang]))

    actions.sort(key=lambda a: _PRIORITY[a.priority])
    first = (profile.get("name") or "").split(" ")[0]
    location = ", ".join(x for x in (profile.get("village"), profile.get("district")) if x)
    return Brief(greeting=T["greet"][lang].format(n=first).strip(" ,"), date=today.isoformat(), location=location,
                 current=current, weather=days, actions=actions[:3], price_alerts=alerts, in_field=field,
                 season_now=calendar.season_now(today, lang), tool_calls=tools)
