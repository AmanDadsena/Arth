"""The four AI features. Each one: model extracts -> Python enforces the rules.

Safety rules applied here, after the model, so they hold whatever it says:
- Label: dose computed by services/dose.py from copied values; else escalate.
- Doctor: confidence < 0.6 or "unsure" escalates to the helpline.
- Document: every returned string is PII-redacted; dates must be real dates.
- Voice: routes and form fields are whitelisted; transcript is redacted
  before the model sees it.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from .. import pii
from ..llm import LANG_NAMES, LLM
from ..schemas import (
    CropDiagnosis,
    Deadline,
    DocumentExplanation,
    DosePerTank,
    LabelReading,
    Lang,
    Treatment,
    VoiceResponse,
)
from .dose import per_tank

ESCALATE_BELOW = 0.6
ROUTES = {"/", "/weather", "/mandi", "/doctor", "/label", "/kagaz", "/calendar", "/schemes", "/profile"}

REDACTED_LABELS = {
    "aadhaar": {"en": "Aadhaar number", "hi": "आधार नंबर", "mr": "आधार क्रमांक"},
    "pan": {"en": "PAN", "hi": "पैन", "mr": "पॅन"},
    "ifsc": {"en": "IFSC code", "hi": "IFSC कोड", "mr": "IFSC कोड"},
    "bank_account": {"en": "Bank account number", "hi": "बैंक खाता नंबर", "mr": "बँक खाते क्रमांक"},
    "phone": {"en": "Mobile number", "hi": "मोबाइल नंबर", "mr": "मोबाईल क्रमांक"},
    "email": {"en": "Email", "hi": "ईमेल", "mr": "ईमेल"},
}

def _lang_line(lang: Lang) -> str:
    return f"Write every farmer-facing text in {LANG_NAMES[lang]}."


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


_PLACEHOLDERS = {"", "null", "none", "n/a", "na", "unknown", "-", "not visible", "not specified"}


def _text(v: str | None) -> str | None:
    """Small models sometimes write the word "null" instead of a JSON null (live finding)."""
    if v is None or v.strip().lower() in _PLACEHOLDERS:
        return None
    return v.strip()


# --- Label reader ---------------------------------------------------------------


class _LabelOut(BaseModel):
    # First field on purpose: the model judges the photo before copying values.
    # A named choice is much harder for a small model to contradict than a bare boolean.
    photo_problem: Literal["none", "blurry", "cut_off", "not_a_label"]
    product_name: str = Field(max_length=120)
    active_ingredient: str = Field(max_length=200)
    formulation: str | None = Field(default=None, max_length=60)
    dose_min: float | None = None
    dose_max: float | None = None
    dose_unit: Literal["g", "kg", "ml", "l"] | None = None
    dose_basis: Literal["per_litre", "per_100_litres", "per_acre", "per_hectare"] | None = None
    water_litres_per_area: float | None = None
    waiting_period_days: int | None = Field(default=None, ge=0, le=365)
    safety: list[str] = Field(default_factory=list, max_length=8)
    warnings: list[str] = Field(default_factory=list, max_length=8)
    confidence: float


async def read_label(llm: LLM, image_b64: str, lang: Lang, tank_litres: float, crop: str | None) -> LabelReading:
    request = f"{_lang_line(lang)}\nCrop: {crop or 'not specified'}."
    out = await llm.structured("label_reader", _LabelOut, user_text=request, images=[image_b64])
    confidence = _clamp01(out.confidence)
    readable = out.photo_problem == "none"
    dose = None
    if readable and confidence >= ESCALATE_BELOW:
        dose = per_tank(dose_min=out.dose_min, dose_max=out.dose_max, unit=out.dose_unit,
                        basis=out.dose_basis, water_litres_per_area=out.water_litres_per_area,
                        tank_litres=tank_litres)
    return LabelReading(
        product_name=_text(out.product_name) or "",
        active_ingredient=_text(out.active_ingredient) or "",
        formulation=_text(out.formulation),
        dose_per_tank=DosePerTank(amount=dose.amount, unit=dose.unit) if dose else None,
        tank_size_litres=tank_litres,
        waiting_period_days=out.waiting_period_days if readable else None,
        safety=[s[:200] for s in out.safety],
        warnings=[s[:200] for s in out.warnings],
        confidence=round(confidence, 2),
        escalate=dose is None,
        model=llm.label,
    )


# --- Crop doctor ----------------------------------------------------------------


class _DoctorOut(BaseModel):
    diagnosis: str = Field(max_length=120)
    scientific_name: str | None = Field(default=None, max_length=120)
    confidence: float
    severity: Literal["low", "medium", "high"]
    symptoms: list[str] = Field(default_factory=list, max_length=6)
    treatment: Treatment
    prevention: list[str] = Field(default_factory=list, max_length=6)
    unsure: bool = False


async def diagnose(llm: LLM, image_b64: str, lang: Lang, crop: str | None) -> CropDiagnosis:
    request = f"{_lang_line(lang)}\nCrop (from the farmer): {crop or 'not specified'}."
    out = await llm.structured("crop_doctor", _DoctorOut, user_text=request, images=[image_b64])
    confidence = _clamp01(out.confidence)
    return CropDiagnosis(
        diagnosis=out.diagnosis,
        scientific_name=_text(out.scientific_name),
        confidence=round(confidence, 2),
        severity=out.severity,
        symptoms=out.symptoms,
        treatment=Treatment(organic=out.treatment.organic[:6], chemical=out.treatment.chemical[:4]),
        prevention=out.prevention,
        # A diagnosis with no visible symptoms is a guess, whatever confidence the model claims
        # (live finding: a drawn, non-real leaf got "whitefly, 0.9" with no symptoms).
        escalate=out.unsure or confidence < ESCALATE_BELOW or not [s for s in out.symptoms if _text(s)],
        model=llm.label,
    )


# --- Explain a document ---------------------------------------------------------


class _DeadlineOut(BaseModel):
    label: str = Field(max_length=120)
    date: str = Field(max_length=10)


class _DocOut(BaseModel):
    readable: bool
    doc_type: str = Field(max_length=80)
    summary: str = Field(max_length=800)
    key_points: list[str] = Field(default_factory=list, max_length=8)
    deadlines: list[_DeadlineOut] = Field(default_factory=list, max_length=6)
    next_steps: list[str] = Field(default_factory=list, max_length=6)


def _valid_date(s: str) -> bool:
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


async def explain(llm: LLM, image_b64: str, lang: Lang) -> DocumentExplanation:
    out = await llm.structured("explain_document", _DocOut, user_text=_lang_line(lang), images=[image_b64])
    kinds: set[str] = set()
    data = pii.redact_obj(out.model_dump(), kinds)
    deadlines = [Deadline(label=d["label"], date=d["date"]) for d in data["deadlines"] if _valid_date(d["date"])]
    return DocumentExplanation(
        doc_type=data["doc_type"],
        summary=data["summary"],
        key_points=data["key_points"],
        deadlines=deadlines,
        next_steps=data["next_steps"],
        redacted_fields=[REDACTED_LABELS[k][lang] for k in sorted(kinds)],
        model=llm.label,
    )


# --- Voice ----------------------------------------------------------------------


class _Slot(BaseModel):
    field: str = Field(max_length=40)
    value: str = Field(max_length=120)


class _VoiceOut(BaseModel):
    reply: str = Field(max_length=400)
    intent: Literal["navigate", "question", "fill_form", "unknown"]
    navigate_to: str | None = None
    slots: list[_Slot] = Field(default_factory=list, max_length=20)
    escalate: bool = False


async def voice(llm: LLM, transcript: str, lang: Lang, screen: str, form_fields: list[str] | None) -> VoiceResponse:
    safe_transcript = pii.redact_text(transcript)
    if not safe_transcript.strip():
        return VoiceResponse(transcript="", reply="", intent="unknown", navigate_to=None, slots={},
                             escalate=False, model=llm.label)
    fields = form_fields or []
    request = (f"{_lang_line(lang)}\nScreen: {screen}\nForm fields: {', '.join(fields) or 'none'}\n"
               f"Farmer said: {safe_transcript}")
    out = await llm.structured("voice", _VoiceOut, user_text=request, temperature=0.2)
    navigate_to = out.navigate_to if out.intent == "navigate" and out.navigate_to in ROUTES else None
    intent = out.intent if (out.intent != "navigate" or navigate_to) else "unknown"
    slots = {s.field: pii.redact_text(s.value) for s in out.slots if s.field in fields} if intent == "fill_form" else {}
    return VoiceResponse(transcript=safe_transcript, reply=pii.redact_text(out.reply), intent=intent,
                         navigate_to=navigate_to, slots=slots, escalate=out.escalate, model=llm.label)


# --- Sell reasoning -------------------------------------------------------------


class _Reasoning(BaseModel):
    reasoning: str = Field(max_length=600)


async def sell_reasoning(llm: LLM, facts: str, lang: Lang) -> str:
    out = await llm.structured("sell_reasoning", _Reasoning, user_text=f"{_lang_line(lang)}\n{facts}",
                               temperature=0.3)
    return pii.redact_text(out.reasoning)
