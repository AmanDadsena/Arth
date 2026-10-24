"""Schemes rules engine and crop calendar: deterministic, so tested exhaustively."""

from datetime import date
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
