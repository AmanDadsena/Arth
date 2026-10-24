"""Crop calendar: season recommendations scored against the farmer's soil and
irrigation (data/crops.json). Deterministic; no model call."""

import json
from datetime import date
from functools import cache
from pathlib import Path

from ..schemas import (
    CalendarResponse,
    CropRecommendation,
    Irrigation,
    Lang,
    Season,
    SoilType,
    SowingWindow,
    TimelineWeek,
)

DATA = Path(__file__).resolve().parent.parent / "data" / "crops.json"
LEVELS = ["low", "medium", "high"]


@cache
def _load() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))["seasons"]


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


def recommend(season: Season, lang: Lang, soil: SoilType | None, irrigation: Irrigation | None,
              today: date | None = None) -> CalendarResponse:
    today = today or date.today()
    recs = []
    for c in _load()[season]:
        start, end = next_window(c["from"], c["to"], today)
        recs.append(CropRecommendation(
            crop=c["crop"],
            name=c["name"][lang],
            suitability=suitability(c["base"], c["soils"], c["water"], soil, irrigation),
            sowing_window=SowingWindow(**{"from": start.isoformat(), "to": end.isoformat()}),
            duration_days=c["durationDays"],
            why=c["why"][lang],
            timeline=[
                TimelineWeek(week=i * 2 + 1, title=w["title"][lang], tasks=[t[lang] for t in w["tasks"]])
                for i, w in enumerate(c["timeline"])
            ],
        ))
    recs.sort(key=lambda r: -LEVELS.index(r.suitability))
    return CalendarResponse(season=season, recommendations=recs)


def current_season(today: date) -> Season:
    """Kharif sown Jun–Sep, rabi Oct–Jan, zaid Feb–May."""
    m = today.month
    if 6 <= m <= 9:
        return "kharif"
    if m >= 10 or m == 1:
        return "rabi"
    return "zaid"
