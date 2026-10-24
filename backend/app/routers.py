"""HTTP routes, one per endpoint in docs/SPEC.md §3 (paths match
frontend/src/lib/api/client.ts). Handlers stay thin: validate, call a
service, return a typed model. The UID always comes from the verified token.
"""

import asyncio
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from pydantic import ValidationError

from . import media
from .auth import User, current_user
from .db import Database
from .errors import ApiError
from .schemas import (
    Brief,
    CalendarResponse,
    CropDiagnosis,
    DeleteResult,
    DocumentExplanation,
    FarmerProfile,
    FarmerProfileInput,
    LabelReading,
    Lang,
    Lat,
    Lon,
    MandiPrices,
    SchemeMatch,
    SchemeMatchRequest,
    Season,
    SellAdvice,
    SellAdviceRequest,
    VoiceContext,
    VoiceResponse,
    Weather,
    round_coord,
)
from .services import ai, brief, calendar, insights, schemes
from .services import mandi as mandi_svc
from .services import weather as weather_svc

log = logging.getLogger("arth")
router = APIRouter()
Auth = Annotated[User, Depends(current_user)]
CommodityQ = Annotated[str, Query(pattern=r"^[a-z][a-z0-9_-]{0,31}$")]


def _db(request: Request) -> Database:
    return request.app.state.db


def _profile(request: Request, user: User) -> dict:
    p = _db(request).get_profile(user.uid)
    if p is None:
        raise ApiError(404, "not_found", "No profile yet")
    return p


# --- health ---------------------------------------------------------------------


@router.get("/health")
async def health(request: Request):
    return {"ok": True, "model": request.app.state.llm.label, "modelReady": await request.app.state.llm.ready()}


# --- farmer profile -------------------------------------------------------------


# Optional onboarding answers: stored and returned only when given, so the frontend
# sees "missing" (undefined), never null, as types.ts declares them.
_OPTIONAL_PROFILE_KEYS = {"experienceYears", "landOwnership", "farmingType", "goals", "sellsAt", "livestock"}


@router.get("/farmer/me", response_model=FarmerProfile, response_model_exclude_unset=True)
def get_farmer(request: Request, user: Auth):
    return _profile(request, user)


@router.put("/farmer/me", response_model=FarmerProfile, response_model_exclude_unset=True)
def put_farmer(request: Request, user: Auth, body: FarmerProfileInput):
    data = body.model_dump(by_alias=True)
    data = {k: v for k, v in data.items() if not (k in _OPTIONAL_PROFILE_KEYS and v is None)}
    return _db(request).put_profile(user.uid, data)


@router.delete("/farmer/me", response_model=DeleteResult)
def delete_farmer(request: Request, user: Auth):
    _db(request).delete_user(user.uid)
    return DeleteResult()


# --- brief & weather ------------------------------------------------------------


@router.get("/brief", response_model=Brief)
async def get_brief(request: Request, user: Auth, lang: Lang = "mr"):
    s = request.app.state
    return await brief.build(http=s.http, mandi=s.mandi, profile=_profile(request, user), lang=lang,
                             timeout=s.settings.http_timeout_s)


@router.get("/weather", response_model=Weather)
async def get_weather(request: Request, user: Auth, lat: Lat, lon: Lon, lang: Lang = "mr"):
    lat, lon = round_coord(lat), round_coord(lon)
    p = _db(request).get_profile(user.uid)
    near_home = p and abs(p["lat"] - lat) < 0.05 and abs(p["lon"] - lon) < 0.05
    location = f"{p['village']}, {p['district']}" if near_home else f"{lat:.2f}, {lon:.2f}"
    s = request.app.state
    return await weather_svc.forecast(s.http, lat, lon, lang, location, s.settings.http_timeout_s)


# --- mandi ----------------------------------------------------------------------


@router.get("/mandi/prices", response_model=MandiPrices)
async def get_prices(request: Request, _: Auth, commodity: CommodityQ, lat: Lat, lon: Lon):
    return await request.app.state.mandi.prices(commodity, round_coord(lat), round_coord(lon))


@router.post("/mandi/sell-advice", response_model=SellAdvice)
async def sell_advice(request: Request, _: Auth, body: SellAdviceRequest):
    s = request.app.state
    prices = await s.mandi.prices(body.commodity, body.lat, body.lon)
    options = s.mandi.sell_options(prices, body.quantity_quintals)
    slope = mandi_svc.slope_per_day(prices.trend)
    decision = mandi_svc.recommend(body.commodity, options[0].modal_price, slope)
    facts = json.dumps({
        "recommendation": decision, "commodity": body.commodity, "quantityQuintals": body.quantity_quintals,
        "trendSlopeRsPerQuintalPerDay": slope,
        "options": [o.model_dump(by_alias=True) for o in options[:4]],
    })
    try:
        reasoning = await ai.sell_reasoning(s.llm, facts, body.lang)
    except ApiError:
        reasoning = ""  # numbers still stand on their own if the model is busy
    return mandi_svc.advice(options, body.commodity, slope, reasoning)


# --- AI -------------------------------------------------------------------------


@router.post("/ai/crop-doctor", response_model=CropDiagnosis)
async def crop_doctor(request: Request, user: Auth, image: UploadFile | None = File(None),
                      lang: Lang = Form("mr"), crop: str | None = Form(None, max_length=32)):
    s = request.app.state
    img = await media.prepare_image(image, s.settings.max_image_bytes, s.settings.image_max_side)
    result = await ai.diagnose(s.llm, img, lang, crop)
    s.db.add_history(user.uid, "crop_doctor", f"{crop or '-'}: {result.diagnosis}")
    return result


@router.post("/ai/label-reader", response_model=LabelReading)
async def label_reader(request: Request, user: Auth, image: UploadFile | None = File(None),
                       lang: Lang = Form("mr"), tankSizeLitres: float = Form(15, gt=0, le=1000),  # noqa: N803
                       crop: str | None = Form(None, max_length=32)):
    s = request.app.state
    img = await media.prepare_image(image, s.settings.max_image_bytes, s.settings.image_max_side)
    result = await ai.read_label(s.llm, img, lang, tankSizeLitres, crop)
    s.db.add_history(user.uid, "label", f"{result.product_name} escalate={result.escalate}")
    return result


@router.post("/ai/explain-document", response_model=DocumentExplanation)
async def explain_document(request: Request, user: Auth, image: UploadFile | None = File(None),
                           lang: Lang = Form("mr"), consent: str = Form("")):
    if consent != "true":
        raise ApiError(400, "consent_required", "consent=true is required")
    s = request.app.state
    img = await media.prepare_image(image, s.settings.max_image_bytes, s.settings.image_max_side)
    result = await ai.explain(s.llm, img, lang)
    s.db.add_history(user.uid, "document", result.doc_type)  # type only, already redacted
    return result


@router.post("/ai/voice", response_model=VoiceResponse)
async def voice(request: Request, _: Auth, audio: UploadFile | None = File(None), lang: Lang = Form("mr"),
                context: str = Form("{}", max_length=2000)):
    try:
        ctx = VoiceContext.model_validate_json(context or "{}")
    except ValidationError:
        raise ApiError(400, "invalid_context", "context must be JSON {screen, formFields?}") from None
    s = request.app.state
    raw = await media.read_audio(audio, s.settings.max_audio_bytes)
    transcript = await s.stt.transcribe(raw, lang)
    del raw  # processed in memory and discarded
    return await ai.voice(s.llm, transcript, lang, ctx.screen, ctx.form_fields)


# --- calendar & schemes ---------------------------------------------------------


@router.get("/calendar", response_model=CalendarResponse)
async def get_calendar(request: Request, user: Auth, season: Season, lang: Lang = "mr"):
    s = request.app.state
    p = s.db.get_profile(user.uid) or {}
    cal = calendar.recommend(season, lang, p.get("soilType"), p.get("irrigation"))
    if "lat" not in p:
        return cal  # no location yet: the plan without "why now" signals
    crops = [r.crop for r in cal.recommendations]

    async def forecast():
        raw = await weather_svc.get_raw(s.http, p["lat"], p["lon"], s.settings.http_timeout_s)
        return weather_svc.parse_days(raw)

    # Signals are extras: each source may fail (offline, no mandi key) and the calendar still renders.
    try:
        async with asyncio.timeout(6):
            results = await asyncio.gather(forecast(), *(s.mandi.prices(c, p["lat"], p["lon"]) for c in crops),
                                           return_exceptions=True)
    except TimeoutError:
        results = [[]] + [None] * len(crops)
    days = results[0] if isinstance(results[0], list) else []
    change = {c: r.change_pct7d for c, r in zip(crops, results[1:], strict=True) if isinstance(r, MandiPrices)}
    today = weather_svc.today_ist()
    for rec in cal.recommendations:
        rec.why_now = insights.why_now(rec.crop, season, lang, days, change, today)
    return cal


@router.post("/schemes/match", response_model=SchemeMatch)
def match_schemes(_: Auth, body: SchemeMatchRequest):
    return schemes.match(body.answers, body.lang)
