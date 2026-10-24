"""The calendar's "why now" signals must match the frontend's demo exactly.

tests/fixtures/whynow_golden.json holds outputs of the real TypeScript
`whyNowFor` (frontend/src/mocks/calendarInsights.ts), run in Node over 336
cases: every crop and season, all three languages, dry/light/good/wet/heavy
rain, warm/cool/fit temperatures, rising/falling/flat/missing prices, and dates
in and out of the sowing months.
"""

import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.schemas import WeatherDay
from app.services import insights

CASES = json.loads((Path(__file__).parent / "fixtures" / "whynow_golden.json").read_text(encoding="utf-8"))


def _forecast(start: str, rains: list[float], max_c: float, min_c: float) -> list[WeatherDay]:
    d0 = date.fromisoformat(start)
    return [WeatherDay(date=(d0 + timedelta(days=i)).isoformat(), min_c=min_c, max_c=max_c, rain_prob=50,
                       rain_mm=r, wind_kmh=10, condition="clear") for i, r in enumerate(rains)]


@pytest.mark.parametrize("case", CASES, ids=lambda c: f"{c['crop']}-{c['lang']}-{c['today']}-{len(c['rains'])}")
def test_matches_frontend_golden(case):
    change = {} if case["pct"] is None else {case["crop"]: case["pct"]}
    got = insights.why_now(case["crop"], case["season"], case["lang"],
                           _forecast(case["today"], case["rains"], case["maxC"], case["minC"]),
                           change, date.fromisoformat(case["today"]))
    assert got.model_dump(by_alias=True) == case["expected"]


def test_golden_covers_every_branch():
    texts = json.dumps([c["expected"] for c in CASES], ensure_ascii=False)
    assert len(CASES) >= 300
    for marker in ("Heavy rain", "Very wet week", "Dry days ahead", "Light rain", "Still warm", "Cool (days",
                   "up 4.3%", "down 3.5%", "steady this past week (+0.2%)", "steady this past week (-0.3%)",
                   "जोरदार", "भारी बारिश"):
        assert marker in texts, marker
