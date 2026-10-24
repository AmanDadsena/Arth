"""Schemes rules engine and crop calendar: deterministic, so tested exhaustively."""

from datetime import date, timedelta
from itertools import product

import pytest

from app.schemas import SchemeAnswers
from app.services import calendar, schemes


def answers(**kw):
    base = dict(owns_land=True, land_acres=2.5, category="general", has_bank_account=True, has_aadhaar=True,
                is_woman=False, irrigation="rainfed", income_tax_payer=False)
    base.update(kw)
    return SchemeAnswers(**base)


def by_id(result):
    return {s.id: s for s in result.schemes}


def test_typical_small_farmer():
    r = by_id(schemes.match(answers(), "en"))
    assert r["pm-kisan"].eligible and r["pmfby"].eligible and r["kcc"].eligible
    assert r["pmksy-drip"].eligible  # rainfed: can apply for drip
    assert not r["ambedkar-swavalamban"].eligible


def test_income_tax_payer_excluded_from_pm_kisan_and_namo():
    r = by_id(schemes.match(answers(income_tax_payer=True), "en"))
    assert not r["pm-kisan"].eligible and not r["namo-shetkari"].eligible


def test_drip_owner_not_offered_drip_subsidy():
    r = by_id(schemes.match(answers(irrigation="drip"), "en"))
    assert not r["pmksy-drip"].eligible
    assert "already" in r["pmksy-drip"].reasons[0]


def test_tenant_farmer_with_land_gets_kcc_not_pm_kisan():
    r = by_id(schemes.match(answers(owns_land=False, land_acres=3), "en"))
    assert r["kcc"].eligible and not r["pm-kisan"].eligible


def test_sc_woman_rates():
    r = by_id(schemes.match(answers(category="sc", is_woman=True), "en"))
    assert r["ambedkar-swavalamban"].eligible
    assert "50%" in r["mahadbt-mech"].reasons[0]


def test_localised_and_sorted():
    r = schemes.match(answers(has_bank_account=False), "mr")
    flags = [s.eligible for s in r.schemes]
    assert flags == sorted(flags, reverse=True)
    assert any("पीक विमा" in s.name for s in r.schemes)
    assert all(s.official_url.startswith("https://") for s in r.schemes)


def test_every_answer_combination_has_a_result_in_every_language():
    for own, bank, aadhaar, woman, itp, cat, irr in product(
        [True, False], [True, False], [True, False], [True, False], [True, False],
        ["general", "obc", "sc", "st"], ["rainfed", "drip", "canal"],
    ):
        a = answers(owns_land=own, has_bank_account=bank, has_aadhaar=aadhaar, is_woman=woman,
                    income_tax_payer=itp, category=cat, irrigation=irr)
        for lang in ("en", "hi", "mr"):
            res = schemes.match(a, lang)
            assert len(res.schemes) == 8 and all(s.reasons[0] and s.documents for s in res.schemes)


# --- calendar ---


@pytest.mark.parametrize(("base", "soils", "water", "soil", "irr", "want"), [
    ("high", ["black"], "medium", "black", "drip", "high"),
    ("high", ["black"], "medium", "sandy", "drip", "medium"),
    ("high", ["black"], "medium", "black", "rainfed", "medium"),
    ("medium", ["black"], "high", "black", "rainfed", "low"),
    ("medium", ["black"], "high", "sandy", "rainfed", "low"),
    ("high", ["black"], "low", "black", "rainfed", "high"),
    ("high", ["black"], "low", None, None, "high"),
])
def test_suitability(base, soils, water, soil, irr, want):
    assert calendar.suitability(base, soils, water, soil, irr) == want


def test_next_window_rolls_to_next_year():
    start, end = calendar.next_window("06-15", "07-10", date(2026, 10, 24))
    assert (start, end) == (date(2027, 6, 15), date(2027, 7, 10))
    start, end = calendar.next_window("11-01", "12-15", date(2026, 10, 24))
    assert start == date(2026, 11, 1)


def test_window_crossing_new_year():
    start, end = calendar.next_window("12-15", "01-15", date(2026, 1, 5))
    assert start == date(2025, 12, 15) and end == date(2026, 1, 15)


@pytest.mark.parametrize(("month", "season"), [(6, "kharif"), (9, "kharif"), (10, "rabi"), (1, "rabi"),
                                               (2, "zaid"), (5, "zaid")])
def test_current_season(month, season):
    assert calendar.current_season(date(2026, month, 10)) == season


@pytest.mark.parametrize("season", ["kharif", "rabi", "zaid"])
@pytest.mark.parametrize("lang", ["en", "hi", "mr"])
def test_recommend_shape(season, lang):
    r = calendar.recommend(season, lang, "black", "drip", date(2026, 10, 24))
    assert r.recommendations
    for c in r.recommendations:
        assert c.sowing_window.from_ <= c.sowing_window.to
        assert c.timeline and c.timeline[0].week == 1


# --- automatic calendar: windows, stages, seasons ---


def test_kharif_window_follows_district_onset():
    from app.services import farm
    nashik = farm.by_name("Nashik")
    r = calendar.recommend("kharif", "en", "black", "drip", date(2027, 5, 20), nashik)
    soy = next(c for c in r.recommendations if c.crop == "soybean")
    assert soy.window_basis == "onset"
    # Nashik's onset trend sits mid-June; soybean is sown 0-25 days after it
    assert "2027-06-10" <= soy.sowing_window.from_ <= "2027-06-20"
    assert soy.status.phase == "upcoming" and soy.status.days > 0


def test_rabi_window_open_status():
    r = calendar.recommend("rabi", "en", "black", "drip", date(2026, 10, 25))
    gram = next(c for c in r.recommendations if c.crop == "gram")
    assert gram.window_basis == "calendar"
    assert gram.status.phase == "open" and gram.status.days == 21


@pytest.mark.parametrize(("crop", "day", "phase"), [
    ("grapes", date(2026, 10, 25), "sow"),       # fruit pruning
    ("soybean", date(2026, 10, 25), "harvest"),
    ("onion", date(2026, 10, 25), "sow"),        # rabi nursery
    ("wheat", date(2027, 1, 20), "protect"),
    ("watermelon", date(2026, 12, 1), "rest"),   # stage crossing new year
])
def test_field_stage(crop, day, phase):
    f = calendar.field_stage(crop, day, "mr")
    assert f is not None and f.phase == phase and 0 <= f.progress <= 1


def test_every_stage_table_covers_the_year():
    for crop in calendar._stages():
        for n in range(365):
            assert calendar.field_stage(crop, date(2026, 1, 1) + timedelta(days=n), "en"), (crop, n)


def test_season_now():
    s = calendar.season_now(date(2026, 10, 25), "en")
    assert s.season == "rabi" and s.next_season == "zaid" and s.next_starts == "2027-02-01"
    assert 0 < s.progress < 0.3 and s.days_left == 98


def test_short_date():
    assert calendar.short_date("2026-11-15", "en") == "15 Nov"
    assert calendar.short_date("2026-11-15", "mr") == "15 नोव्हें"


# --- soil from location ---


def test_soil_from_location():
    from app.services import farm
    assert farm.soil_type(20.0, 73.79, None) == "black"           # Nashik
    assert farm.soil_type(16.99, 73.3, None) == "laterite"        # Ratnagiri
    assert farm.soil_type(None, None, "Gadchiroli") == "red"
    assert farm.locate(None, None, "Aurangabad")["id"] == "Chhatrapati Sambhajinagar"
    assert farm.nearest(28.6, 77.2) is None                        # Delhi: not ours
    r = farm.report(20.08, 74.11, "Nashik", "en")
    assert r.district == "Nashik" and r.samples > 1000
    assert 0 < r.nitrogen.low <= 1 and r.tips[-1].startswith("These are district odds")
