from datetime import date, timedelta

import pytest

from app.services import weather
from app.services.mandi import PricePoint, change_pct, haversine_km, parse_records, recommend, slope_per_day

from .conftest import forecast_payload, mandi_records


def days():
    return weather.parse_days(forecast_payload())


@pytest.mark.parametrize(("code", "rain", "want"), [
    (0, 0, "clear"), (2, 0, "partly_cloudy"), (3, 0, "cloudy"), (45, 0, "fog"), (61, 2, "rain"),
    (63, 25, "heavy_rain"), (65, 0, "heavy_rain"), (81, 3, "rain"), (95, 10, "thunderstorm"), (None, 0, "cloudy"),
])
def test_condition_mapping(code, rain, want):
    assert weather.condition(code, rain) == want


def test_day_words_localised():
    d = days()
    assert weather.day_word(d[0].date, d, "en") == "today"
    assert weather.day_word(d[1].date, d, "mr") == "उद्या"
    third = date.fromisoformat(d[2].date)
    assert weather.day_word(d[2].date, d, "en") == third.strftime("%A")


def test_rain_severity_and_title():
    adv = weather.advisories(days(), "en")
    rain = next(a for a in adv if a.rule == "rain_no_spray")
    assert rain.severity == "danger" and rain.title == "Don't spray tomorrow — 85% rain"
    payload = forecast_payload(rain=(10, 70, 20, 5, 0, 0, 0))
    rain = next(a for a in weather.advisories(weather.parse_days(payload), "hi") if a.rule == "rain_no_spray")
    assert rain.severity == "warning" and rain.title.startswith("कल")


def test_only_first_four_days_advised():
    payload = forecast_payload(rain=(0, 0, 0, 0, 0, 99, 99), wind=(0,) * 7, tmax=(30,) * 7)
    assert weather.advisories(weather.parse_days(payload), "en") == []


# --- mandi math ---


def test_parse_records_filters_and_normalises():
    rows = parse_records(mandi_records(), "Maharashtra", "Onion")
    assert {r["market"] for r in rows} == {"Lasalgaon", "Pune", "Yeola"}
    assert all(len(r["arrival_date"]) == 10 and r["modal_price"] > 0 for r in rows)


def test_haversine_known_distance():
    # Nashik -> Pune is about 165 km in a straight line
    assert 150 < haversine_km((20.0, 73.79), (18.52, 73.86)) < 175


def series(prices):
    end = date(2026, 10, 24)
    return [PricePoint(date=(end - timedelta(days=len(prices) - 1 - i)).isoformat(), modal_price=p)
            for i, p in enumerate(prices)]


def test_slope_and_change():
    s = series([2000, 2010, 2020, 2030, 2040, 2050, 2060, 2070])
    assert slope_per_day(s) == 10.0
    assert change_pct(s, 7) == 3.5
    assert slope_per_day(series([2000, 2000])) == 0.0
    assert change_pct([], 7) == 0.0


def test_recommendation_rules():
    assert recommend("onion", 2000, 15) == "WAIT"      # rising >0.5%/day and stores well
    assert recommend("onion", 2000, 5) == "SELL_NOW"
    assert recommend("tomato", 2000, 50) == "SELL_NOW"  # perishable never waits
