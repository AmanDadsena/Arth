"""Nearby pest outbreak alerts from farmers' own Crop Doctor results.

Evidence: rising pest-related Kisan Call Centre calls track lower yields, and
region-specific pest alerts are recommended to cut losses (Cornell TCI study of
17M KCC queries). Arth turns confident diagnoses into such alerts.

Privacy: only district, crop and pest are stored per report; an alert appears
only when at least `min_farmers` different farmers in the district reported the
same pest within 7 days, so no single report can be traced to a person.
"""

import re
from datetime import UTC, datetime, timedelta

from ..db import Database
from ..schemas import ActionItem, Lang
from .names import crop_name

WINDOW_DAYS = 7
_CROP_ID = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")

_T = {
    "title": {
        "en": "{n} farmers near {district} reported {pest} on {crop} this week",
        "hi": "{district} के पास {n} किसानों ने इस हफ़्ते {crop} पर {pest} बताया",
        "mr": "{district} जवळ {n} शेतकऱ्यांनी या आठवड्यात {crop} वर {pest} नोंदवला",
    },
    "title_any": {
        "en": "{n} farmers near {district} reported {pest} this week",
        "hi": "{district} के पास {n} किसानों ने इस हफ़्ते {pest} बताया",
        "mr": "{district} जवळ {n} शेतकऱ्यांनी या आठवड्यात {pest} नोंदवला",
    },
    "detail": {
        "en": ("Check your field today, especially the underside of leaves. "
               "Take a photo in Crop Doctor to confirm before spraying."),
        "hi": "आज अपना खेत देखें, ख़ासकर पत्तों के नीचे। छिड़काव से पहले फसल डॉक्टर में फ़ोटो लेकर पक्का करें।",
        "mr": "आज आपले शेत तपासा, विशेषतः पानांची खालची बाजू. फवारणीपूर्वी पीक डॉक्टरमध्ये फोटो घेऊन खात्री करा.",
    },
}


def norm_district(district: str | None) -> str | None:
    d = " ".join((district or "").split()).casefold()
    return d or None


def norm_crop(crop: str | None) -> str:
    c = (crop or "").strip().lower()
    return c if _CROP_ID.match(c) else ""


def nearby_alerts(db: Database, district: str | None, lang: Lang, my_crops: list[str], min_farmers: int,
                  now: datetime | None = None, limit: int = 2) -> list[ActionItem]:
    area = norm_district(district)
    if not area:
        return []
    now = now or datetime.now(UTC)
    rows = db.pest_outbreaks(area, now - timedelta(days=WINDOW_DAYS), min_farmers)
    # The farmer's own crops first, then the rest of the district.
    rows.sort(key=lambda r: (r["crop"] not in my_crops, -r["farmers"]))
    out = []
    for r in rows[:limit]:
        local, en = db.pest_names(area, r["crop"], r["pest_key"], lang)
        pest = local or en or r["pest_key"].capitalize()
        key = "title" if r["crop"] else "title_any"
        title = _T[key][lang].format(n=r["farmers"], district=district.strip(), pest=pest,
                                     crop=crop_name(r["crop"], lang))
        out.append(ActionItem(
            id=f"pest-{r['crop'] or 'any'}-{r['pest_key'].replace(' ', '-')}",
            type="protect",
            priority="high" if r["crop"] in my_crops else "medium",
            source="community",
            route="/doctor",
            title=title,
            detail=_T["detail"][lang],
        ))
    return out
