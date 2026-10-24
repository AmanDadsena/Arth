import pytest

from app.services.dose import per_tank


def dose(**kw):
    args = dict(dose_min=2.5, dose_max=None, unit="g", basis="per_litre", water_litres_per_area=None,
                tank_litres=15)
    args.update(kw)
    return per_tank(**args)


def test_per_litre():
    d = dose()
    assert (d.amount, d.unit) == (37.5, "g")
    assert "15 L tank = 37.5 g" in d.formula


def test_per_100_litres():
    d = dose(dose_min=200, unit="ml", basis="per_100_litres", tank_litres=16)
    assert (d.amount, d.unit) == (32.0, "ml")


def test_per_acre_needs_water_volume():
    assert dose(dose_min=400, unit="ml", basis="per_acre") is None
    d = dose(dose_min=400, unit="ml", basis="per_acre", water_litres_per_area=200)
    assert d.amount == 30.0  # 400/200 * 15


def test_per_hectare_kg_converted():
    d = dose(dose_min=1.5, dose_max=2, unit="kg", basis="per_hectare", water_litres_per_area=500)
    assert (d.amount, d.unit) == (45.0, "g")  # 1500 g / 500 L * 15
    assert d.used_range_low


def test_litres_converted_to_ml():
    d = dose(dose_min=1, unit="l", basis="per_hectare", water_litres_per_area=500)
    assert (d.amount, d.unit) == (30.0, "ml")


@pytest.mark.parametrize("kw", [
    {"dose_min": None},
    {"unit": None},
    {"basis": None},
    {"unit": "tablets"},
    {"basis": "per_plant"},
    {"dose_min": 0},
    {"dose_min": -1},
    {"dose_min": 3, "dose_max": 2},
    {"tank_litres": 0},
    {"tank_litres": 5000},
    {"dose_min": 500},  # 500 g per litre is not a real label: misread
    {"basis": "per_acre", "water_litres_per_area": 0},
])
def test_refuses_unsafe_or_missing(kw):
    assert dose(**kw) is None


def test_large_amounts_rounded_whole():
    d = dose(dose_min=10, unit="ml", tank_litres=200)
    assert d.amount == 2000.0
