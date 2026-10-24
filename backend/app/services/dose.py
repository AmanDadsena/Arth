"""Pesticide dose for the farmer's tank. Plain arithmetic, never the model.

The model only copies what is printed on the label. If anything needed for the
calculation is missing or implausible, there is no dose: the app shows the
Kisan Call Centre instead of a guess.
"""

from dataclasses import dataclass
from typing import Literal

Basis = Literal["per_litre", "per_100_litres", "per_acre", "per_hectare"]

_TO_BASE = {"g": ("g", 1.0), "kg": ("g", 1000.0), "ml": ("ml", 1.0), "l": ("ml", 1000.0)}
# Plausibility bounds: outside these the reading is almost certainly wrong.
_MAX_PER_LITRE = {"g": 50.0, "ml": 50.0}
_TANK_RANGE = (1.0, 1000.0)


@dataclass(frozen=True)
class Dose:
    amount: float
    unit: Literal["g", "ml"]
    formula: str
    used_range_low: bool  # label gave a range; we used its lower end


def _round(x: float) -> float:
    return round(x, 1) if x < 100 else float(round(x))


def per_tank(*, dose_min: float | None, dose_max: float | None, unit: str | None, basis: str | None,
             water_litres_per_area: float | None, tank_litres: float) -> Dose | None:
    """Dose for one tank, or None when it cannot be computed safely."""
    if dose_min is None or unit is None or basis is None:
        return None
    if unit.lower() not in _TO_BASE or not _TANK_RANGE[0] <= tank_litres <= _TANK_RANGE[1]:
        return None
    if dose_min <= 0 or (dose_max is not None and dose_max < dose_min):
        return None
    base_unit, factor = _TO_BASE[unit.lower()]
    # A range on the label ("1.5–2 kg") uses its lower end: never exceed what is printed.
    value = dose_min * factor
    used_low = dose_max is not None and dose_max > dose_min

    if basis == "per_litre":
        per_litre, how = value, f"{_round(value)} {base_unit}/L"
    elif basis == "per_100_litres":
        per_litre, how = value / 100, f"{_round(value)} {base_unit} / 100 L"
    elif basis in ("per_acre", "per_hectare"):
        if not water_litres_per_area or water_litres_per_area <= 0:
            return None  # can't convert an area dose to a tank without the label's water volume
        area = "acre" if basis == "per_acre" else "ha"
        per_litre = value / water_litres_per_area
        how = f"{_round(value)} {base_unit} per {area} ÷ {_round(water_litres_per_area)} L water"
    else:
        return None

    if per_litre > _MAX_PER_LITRE[base_unit]:
        return None
    amount = _round(per_litre * tank_litres)
    if amount <= 0:
        return None
    return Dose(amount, base_unit, f"{how} × {_round(tank_litres)} L tank = {amount} {base_unit}", used_low)  # type: ignore[arg-type]
