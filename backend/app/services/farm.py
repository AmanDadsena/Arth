"""What Arth knows about a farm from its location alone, so onboarding never
asks for it (the approach of the sister project Rutu):

- the district, from the profile or the nearest district centre;
- the district's dominant soil type;
- Soil Health Card results: the share of tested fields in the district that
  came back low in each nutrient. That is the odds for this farmer's field,
  not a reading of it, and the tips say so;
- the district's monsoon onset from 40 years of IMD rainfall, which moves the
  kharif sowing windows (services/calendar.py).

Data: data/districts.json, built by scripts/build_districts.py. No model call.
"""

import json
import math
from datetime import date, timedelta
from functools import cache
from pathlib import Path

from ..schemas import Lang, MonsoonOnset, NutrientShares, SoilReport, SoilType

DATA = Path(__file__).resolve().parent.parent / "data" / "districts.json"
SHC_URL = "https://soilhealth.dac.gov.in/nutrient-dashboard"
# Beyond ~150 km from every district centre the point is not in Maharashtra.
MAX_KM = 150
ALIASES = {"aurangabad": "Chhatrapati Sambhajinagar", "osmanabad": "Dharashiv", "ahilyanagar": "Ahmednagar"}


@cache
def _load() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def districts() -> list[dict]:
    return _load()["districts"]


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def by_name(name: str | None) -> dict | None:
    if not name:
        return None
    key = name.strip().lower()
    key = ALIASES.get(key, key).lower()
    return next((d for d in districts() if key in (d["id"].lower(), d["en"].lower(), d["dev"])), None)


def nearest(lat: float, lon: float) -> dict | None:
    best = min(districts(), key=lambda d: _km((lat, lon), (d["lat"], d["lon"])))
    return best if _km((lat, lon), (best["lat"], best["lon"])) <= MAX_KM else None


def locate(lat: float | None, lon: float | None, district: str | None = None) -> dict | None:
    """The named district if we know it, else the nearest one to the point."""
    found = by_name(district)
    if found is None and lat is not None and lon is not None:
        found = nearest(lat, lon)
    return found


def soil_type(lat: float | None, lon: float | None, district: str | None) -> SoilType:
    d = locate(lat, lon, district)
    return d["soilType"] if d else "black"  # the Deccan default


def _doy_to_date(year: int, doy: float) -> date:
    return date(year, 1, 1) + timedelta(days=round(doy) - 1)


def onset(district: dict | None, year: int) -> MonsoonOnset | None:
    o = (district or {}).get("onset")
    if not o:
        return None
    return MonsoonOnset(
        district=district["id"],
        expected=_doy_to_date(year, o["todayDoy"]).isoformat(),
        old_date=_doy_to_date(year, o["fatherDoy"]).isoformat(),
        shift_days=o["shiftDays"],
        significant=o["significant"],
        years=o["years"],
    )


def onset_doy(district: dict | None) -> float | None:
    o = (district or {}).get("onset")
    return o["todayDoy"] if o else None


_TIPS = {
    "n_low": {"en": "{p}% of fields tested in {d} are low in nitrogen. "
                    "Add compost and grow a pulse like gram or soybean in rotation.",
              "hi": "{d} में जाँचे गए {p}% खेतों में नाइट्रोजन कम है। खाद डालें और चना या सोयाबीन जैसी दलहन फसल बदल-बदल कर लें।",
              "mr": "{d} मध्ये तपासलेल्या {p}% शेतांत नत्र कमी आहे. शेणखत टाका आणि हरभरा, सोयाबीनसारखे कडधान्य फेरपालटीत घ्या."},
    "oc_low": {"en": "{p}% are low in organic carbon. Keep crop residue in the field and add farmyard manure.",
               "hi": "{p}% में जैविक कार्बन कम है। फसल अवशेष खेत में रखें और गोबर खाद डालें।",
               "mr": "{p}% शेतांत सेंद्रिय कर्ब कमी आहे. पिकांचे अवशेष शेतात ठेवा आणि शेणखत टाका."},
    "zn": {"en": "Zinc is short in {p}% of fields. Ask the soil lab whether yours needs zinc sulphate.",
           "hi": "{p}% खेतों में ज़िंक की कमी है। मिट्टी जाँच केंद्र से पूछें कि आपके खेत को ज़िंक सल्फेट चाहिए या नहीं।",
           "mr": "{p}% शेतांत जस्ताची कमतरता आहे. तुमच्या शेताला झिंक सल्फेट लागेल का ते माती प्रयोगशाळेत विचारा."},
    "s": {"en": "Sulphur is short in {p}% of fields; oilseeds like soybean feel it first.",
          "hi": "{p}% खेतों में सल्फर कम है; सोयाबीन जैसी तिलहन पर पहले असर दिखता है।",
          "mr": "{p}% शेतांत गंधक कमी आहे; सोयाबीनसारख्या तेलबियांवर आधी परिणाम दिसतो."},
    "test": {"en": "These are district odds, not your field. "
                   "Get your own field tested free under the Soil Health Card scheme.",
             "hi": "ये ज़िले के आँकड़े हैं, आपके खेत की जाँच नहीं। मृदा स्वास्थ्य कार्ड योजना में अपने खेत की मुफ़्त जाँच कराएँ।",
             "mr": "हे जिल्ह्याचे आकडे आहेत, तुमच्या शेताची तपासणी नाही. मृदा आरोग्य पत्रिका योजनेत तुमच्या शेताची मोफत तपासणी करा."},
}


def _shares(v: list[float] | None) -> NutrientShares | None:
    return NutrientShares(low=v[0], medium=v[1], high=v[2]) if v else None


def report(lat: float | None, lon: float | None, district: str | None, lang: Lang) -> SoilReport | None:
    d = locate(lat, lon, district)
    if d is None:
        return None
    shc = d.get("shc")
    name = d["en"] if lang == "en" else d["dev"]
    tips: list[str] = []
    deficient: dict[str, float] = {}
    if shc:
        pct = lambda x: round(x * 100)  # noqa: E731
        if shc["n"][0] >= 0.5:
            tips.append(_TIPS["n_low"][lang].format(p=pct(shc["n"][0]), d=name))
        if shc["oc"][0] >= 0.4:
            tips.append(_TIPS["oc_low"][lang].format(p=pct(shc["oc"][0])))
        if shc["zn"] >= 0.4:
            tips.append(_TIPS["zn"][lang].format(p=pct(shc["zn"])))
        if shc["s"] >= 0.5:
            tips.append(_TIPS["s"][lang].format(p=pct(shc["s"])))
        deficient = {"sulphur": shc["s"], "zinc": shc["zn"], "boron": shc["b"], "iron": shc["fe"]}
    tips.append(_TIPS["test"][lang])
    return SoilReport(
        district=d["id"],
        district_local=name,
        soil_type=d["soilType"],
        cycle=shc["cycle"] if shc else None,
        samples=shc["samples"] if shc else 0,
        nitrogen=_shares(shc and shc["n"]),
        phosphorus=_shares(shc and shc["p"]),
        potassium=_shares(shc and shc["k"]),
        organic_carbon=_shares(shc and shc["oc"]),
        deficient=deficient,
        tips=tips,
        source=SHC_URL,
    )


def nitrogen_low_share(district: dict | None) -> float | None:
    shc = (district or {}).get("shc")
    return shc["n"][0] if shc else None
