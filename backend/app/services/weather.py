"""Weather from Open-Meteo (free, no key, CC BY 4.0) and spray/irrigation
advisories from fixed thresholds. The thresholds are rules, not model output."""

from datetime import date, datetime, timedelta, timezone

import httpx

from ..errors import ApiError
from ..schemas import Advisory, CurrentWeather, Lang, Weather, WeatherCondition, WeatherDay
from .cache import TTLCache

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
IST = timezone(timedelta(hours=5, minutes=30))

RAIN_NO_SPRAY_PROB = 60  # %
RAIN_DANGER_PROB = 80
WIND_NO_SPRAY_KMH = 20
HEAT_IRRIGATE_C = 38

_cache: TTLCache[dict] = TTLCache(ttl_s=15 * 60)


def condition(wmo: int | None, rain_mm: float = 0.0) -> WeatherCondition:
    """Map a WMO weather code (Open-Meteo `weather_code`) to the app's conditions."""
    if wmo is None:
        return "cloudy"
    if wmo == 0:
        return "clear"
    if wmo in (1, 2):
        return "partly_cloudy"
    if wmo in (45, 48):
        return "fog"
    if wmo >= 95:
        return "thunderstorm"
    if wmo in (65, 67, 82) or rain_mm >= 20:
        return "heavy_rain"
    if 51 <= wmo <= 67 or 80 <= wmo <= 81:
        return "rain"
    return "cloudy"  # 3 overcast; snow codes never occur on the plains but must map somewhere


async def _fetch(http: httpx.AsyncClient, lat: float, lon: float, timeout: float) -> dict:
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
        "hourly": "precipitation_probability",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
                 "precipitation_probability_max,wind_speed_10m_max",
        "timezone": "Asia/Kolkata",
        "forecast_days": 7,
    }
    try:
        r = await http.get(FORECAST_URL, params=params, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except (httpx.HTTPError, ValueError):
        raise ApiError(503, "weather_unavailable", "Weather is not available right now.") from None


def _num(v, default=0.0) -> float:
    return float(v) if isinstance(v, (int, float)) else default


def parse_days(raw: dict) -> list[WeatherDay]:
    d = raw["daily"]
    days = []
    for i, day in enumerate(d["time"]):
        rain_mm = _num(d["precipitation_sum"][i])
        days.append(WeatherDay(
            date=day,
            min_c=round(_num(d["temperature_2m_min"][i]), 1),
            max_c=round(_num(d["temperature_2m_max"][i]), 1),
            rain_prob=int(_num(d["precipitation_probability_max"][i])),
            rain_mm=round(rain_mm, 1),
            wind_kmh=round(_num(d["wind_speed_10m_max"][i]), 1),
            condition=condition(d["weather_code"][i], rain_mm),
        ))
    return days


def _current_rain_prob(raw: dict) -> int:
    hourly = raw.get("hourly", {})
    now = raw.get("current", {}).get("time", "")[:13]  # "YYYY-MM-DDTHH"
    for t, p in zip(hourly.get("time", []), hourly.get("precipitation_probability", []), strict=False):
        if t[:13] == now:
            return int(_num(p))
    return 0


_TEXT = {
    "rain_title": {"en": "Don't spray {when} — {p}% rain", "hi": "{when} छिड़काव न करें — {p}% बारिश",
                   "mr": "{when} फवारणी करू नका — {p}% पाऊस"},
    "rain_detail": {"en": "Rain will wash the spray off the leaves. Spray after the rain stops and leaves dry.",
                    "hi": "बारिश से दवा पत्तों से धुल जाएगी। बारिश रुकने और पत्ते सूखने के बाद छिड़काव करें।",
                    "mr": "पावसाने औषध पानांवरून धुऊन जाईल. पाऊस थांबून पाने सुकल्यावर फवारणी करा."},
    "wind_title": {"en": "Strong wind {w} km/h — avoid spraying", "hi": "तेज़ हवा {w} किमी/घंटा — छिड़काव टालें",
                   "mr": "जोराचा वारा {w} किमी/तास — फवारणी टाळा"},
    "wind_detail": {"en": "Spray drifts away in wind and can reach you or the next field.",
                    "hi": "हवा में दवा उड़कर आप पर या पड़ोसी खेत में जा सकती है।",
                    "mr": "वाऱ्यात औषध उडून तुमच्यावर किंवा शेजारच्या शेतात जाऊ शकते."},
    "heat_title": {"en": "Very hot — irrigate in the evening", "hi": "बहुत गर्मी — शाम को सिंचाई करें",
                   "mr": "खूप उष्ण — संध्याकाळी पाणी द्या"},
    "heat_detail": {"en": "Evening water is not lost to the afternoon sun.",
                    "hi": "शाम का पानी दोपहर की धूप में नहीं उड़ता।",
                    "mr": "संध्याकाळचे पाणी दुपारच्या उन्हात उडून जात नाही."},
}


_RELATIVE = {"en": ("today", "tomorrow"), "hi": ("आज", "कल"), "mr": ("आज", "उद्या")}
# Monday first, matching date.weekday()
_WEEKDAYS = {
    "en": ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"),
    "hi": ("सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"),
    "mr": ("सोमवार", "मंगळवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"),
}


def day_word(day: str, days: list[WeatherDay], lang: Lang) -> str:
    """'today' / 'tomorrow' for the first two forecast days, else the weekday name."""
    i = next((n for n, d in enumerate(days) if d.date == day), -1)
    if i in (0, 1):
        return _RELATIVE[lang][i]
    return _WEEKDAYS[lang][date.fromisoformat(day).weekday()]


def advisories(days: list[WeatherDay], lang: Lang) -> list[Advisory]:
    out: list[Advisory] = []
    for d in days[:4]:
        when = day_word(d.date, days, lang)
        if d.rain_prob > RAIN_NO_SPRAY_PROB:
            severity = "danger" if d.rain_prob >= RAIN_DANGER_PROB else "warning"
            out.append(Advisory(id=f"rain-{d.date}", severity=severity, rule="rain_no_spray", date=d.date,
                                title=_TEXT["rain_title"][lang].format(when=when, p=d.rain_prob),
                                detail=_TEXT["rain_detail"][lang]))
        if d.wind_kmh > WIND_NO_SPRAY_KMH:
            out.append(Advisory(id=f"wind-{d.date}", severity="info", rule="wind_no_spray", date=d.date,
                                title=_TEXT["wind_title"][lang].format(w=round(d.wind_kmh)),
                                detail=_TEXT["wind_detail"][lang]))
        if d.max_c > HEAT_IRRIGATE_C:
            out.append(Advisory(id=f"heat-{d.date}", severity="danger", rule="heat_irrigate", date=d.date,
                                title=_TEXT["heat_title"][lang], detail=_TEXT["heat_detail"][lang]))
    return out


async def get_raw(http: httpx.AsyncClient, lat: float, lon: float, timeout: float) -> dict:
    lat, lon = round(lat, 2), round(lon, 2)
    return await _cache.get(f"{lat},{lon}", lambda: _fetch(http, lat, lon, timeout))


async def forecast(http: httpx.AsyncClient, lat: float, lon: float, lang: Lang, location: str,
                   timeout: float) -> Weather:
    raw = await get_raw(http, lat, lon, timeout)
    days = parse_days(raw)
    cur = raw.get("current", {})
    current = CurrentWeather(
        temp_c=round(_num(cur.get("temperature_2m")), 1),
        feels_like_c=round(_num(cur.get("apparent_temperature")), 1),
        humidity=int(_num(cur.get("relative_humidity_2m"))),
        wind_kmh=round(_num(cur.get("wind_speed_10m")), 1),
        rain_prob=_current_rain_prob(raw),
        condition=condition(cur.get("weather_code")),
    )
    return Weather(location=location, current=current, daily=days, advisories=advisories(days, lang))


def today_ist() -> date:
    return datetime.now(IST).date()
