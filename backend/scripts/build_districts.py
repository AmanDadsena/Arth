"""Build app/data/districts.json: one record per Maharashtra district with
everything Arth can know about a farm from its location alone.

Inputs (from the sister project Rutu, MIT, same team):
  districts.json  IMD gridded daily rainfall 1985-2025 -> monsoon onset per district
                  (Theil-Sen trend, Mann-Kendall significance), plus the district centre.
  soil.json       Soil Health Card Nutrient Dashboard (soilhealth.dac.gov.in): how many
                  field samples per district tested Low / Medium / High for each nutrient.

The soil TYPE (black / red / laterite / alluvial) is the dominant soil of the district on
the general soil map of Maharashtra. It describes the district, not one field; the app
says so and lets the farmer correct it in Settings.

Usage:
  python scripts/build_districts.py <path to Project-Rutu checkout>
"""

import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "data" / "districts.json"

# Rutu id -> Arth id (the name farmers and the mandi data use)
RENAME = {"Ch.Sambhajinagar": "Chhatrapati Sambhajinagar"}

# Dominant soil per district (general soil map of Maharashtra). Deccan trap basalt gives
# black soils across most of the state; the Konkan coast is lateritic; eastern Vidarbha
# (Wainganga basin) is red and yellow; the Tapi valley adds alluvium in Jalgaon.
LATERITE = {"Ratnagiri", "Sindhudurg", "Raigad", "Thane", "Palghar", "Mumbai City", "Mumbai Suburban"}
RED = {"Gadchiroli", "Gondia", "Bhandara"}
ALLUVIAL = {"Jalgaon"}


def soil_type(district: str) -> str:
    if district in LATERITE:
        return "laterite"
    if district in RED:
        return "red"
    if district in ALLUVIAL:
        return "alluvial"
    return "black"


def shares(counts: list[int]) -> list[float]:
    total = sum(counts)
    return [round(c / total, 3) if total else 0.0 for c in counts]


def latest_soil(entry: dict | None) -> dict | None:
    if not entry:
        return None
    cycle = sorted(entry)[-1]
    c = entry[cycle]
    return {
        "cycle": cycle,
        "samples": c["samples"],
        # [low, medium, high] shares
        "n": shares(c["n"]), "p": shares(c["p"]), "k": shares(c["k"]), "oc": shares(c["OC"]),
        # share of samples deficient
        "s": shares(c["S"])[0], "zn": shares(c["Zn"])[0], "b": shares(c["B"])[0], "fe": shares(c["Fe"])[0],
    }


def main(rutu: Path) -> None:
    src = json.loads((rutu / "src/data/districts.json").read_text(encoding="utf-8"))
    soil = json.loads((rutu / "src/data/soil.json").read_text(encoding="utf-8"))
    out = []
    for d in src["districts"]:
        o = d.get("onset") or {}
        out.append({
            "id": RENAME.get(d["id"], d["id"]),
            "en": RENAME.get(d["en"], d["en"]),
            "dev": d["dev"],
            "division": d.get("division"),
            "lat": d["lat"],
            "lon": d["lon"],
            "soilType": soil_type(RENAME.get(d["id"], d["id"])),
            "onset": {
                "fatherDoy": round(o["fatherDoy"], 1),
                "todayDoy": round(o["todayDoy"], 1),
                "shiftDays": round(o["shiftDays"], 1),
                "significant": bool(o["significant"]),
                "p": o["p"],
                "years": f'{o["yearFrom"]}-{o["yearTo"]}',
            } if o.get("todayDoy") else None,
            "shc": latest_soil(soil["districts"].get(d["id"])),
        })
    payload = {
        "_note": "Built by scripts/build_districts.py. Monsoon onset: IMD Pune gridded daily rainfall "
                 "1985-2025. Nutrients: Soil Health Card Nutrient Dashboard, shares of field samples "
                 "per rating in the latest completed cycle. soilType: dominant soil of the district.",
        "sources": {
            "onset": src["source"],
            "onsetMethod": src["method"],
            "soil": soil["source"],
            "ratings": soil["ratings"],
        },
        "districts": sorted(out, key=lambda x: x["id"]),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}: {len(out)} districts, {sum(1 for x in out if x['shc'])} with soil tests")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
