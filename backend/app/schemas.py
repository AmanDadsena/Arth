"""Pydantic models mirroring frontend/src/lib/api/types.ts. Change both or neither.

Python uses snake_case; the wire format is camelCase (alias generator).
Request models forbid unknown fields and bound every string and number, so
oversized or unexpected input is rejected before any handler runs.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from pydantic.alias_generators import to_camel

Lang = Literal["en", "hi", "mr"]
Season = Literal["kharif", "rabi", "zaid"]
SoilType = Literal["black", "red", "alluvial", "laterite", "sandy", "clay"]
Irrigation = Literal["rainfed", "drip", "sprinkler", "canal", "borewell"]
Priority = Literal["high", "medium", "low"]
WeatherCondition = Literal[
    "clear", "partly_cloudy", "cloudy", "rain", "heavy_rain", "thunderstorm", "fog"
]

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
CommodityId = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[a-z][a-z0-9_-]{0,31}$")
]
Lat = Annotated[float, Field(ge=6.0, le=37.5)]  # India's bounding box
Lon = Annotated[float, Field(ge=68.0, le=98.0)]


def round_coord(v: float) -> float:
    """~1 km precision (docs/SPEC.md §5.8): never store or forward more than that."""
    return round(v, 2)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ApiInput(ApiModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


# ---- Farmer profile ----------------------------------------------------------


class FarmerProfileInput(ApiInput):
    name: ShortText
    lang: Lang
    village: ShortText
    district: ShortText
    state: ShortText
    lat: Lat
    lon: Lon
    crops: list[CommodityId] = Field(max_length=12)
    land_acres: float = Field(ge=0, le=10_000)
    soil_type: SoilType
    irrigation: Irrigation
    tank_size_litres: float = Field(gt=0, le=1000)
    consent_at: str | None = Field(default=None, max_length=40)

    @field_validator("lat", "lon")
    @classmethod
    def _round(cls, v: float) -> float:
        return round_coord(v)


class FarmerProfile(FarmerProfileInput):
    created_at: str | None = None
    updated_at: str | None = None


class DeleteResult(ApiModel):
    deleted: Literal[True] = True


# ---- Weather -----------------------------------------------------------------


class WeatherDay(ApiModel):
    date: str
    min_c: float
    max_c: float
    rain_prob: int
    rain_mm: float
    wind_kmh: float
    condition: WeatherCondition


class Advisory(ApiModel):
    id: str
    severity: Literal["danger", "warning", "info"]
    rule: Literal["rain_no_spray", "heat_irrigate", "wind_no_spray", "other"]
    title: str
    detail: str
    date: str


class CurrentWeather(ApiModel):
    temp_c: float
    feels_like_c: float
    humidity: int
    wind_kmh: float
    rain_prob: int
    condition: WeatherCondition


class Weather(ApiModel):
    location: str
    current: CurrentWeather
    daily: list[WeatherDay]
    advisories: list[Advisory]


# ---- Brief -------------------------------------------------------------------


class ActionItem(ApiModel):
    id: str
    type: Literal["spray", "irrigate", "harvest", "sell", "sow", "protect", "scheme"]
    priority: Priority
    title: str
    detail: str
    source: Literal["weather", "mandi", "calendar"]
    route: str | None


class PriceAlert(ApiModel):
    commodity: str
    market: str
    modal_price: int
    change_pct: float
    direction: Literal["up", "down", "flat"]


class ToolCallLog(ApiModel):
    name: str
    args: dict[str, object]
    ms: int


class Brief(ApiModel):
    greeting: str
    date: str
    weather: list[WeatherDay]
    actions: list[ActionItem]
    price_alerts: list[PriceAlert]
    tool_calls: list[ToolCallLog]


# ---- Mandi -------------------------------------------------------------------


class MarketPrice(ApiModel):
    market: str
    district: str
    min_price: int
    max_price: int
    modal_price: int
    distance_km: float
    arrival_date: str


class PricePoint(ApiModel):
    date: str
    modal_price: int


class MandiPrices(ApiModel):
    commodity: str
    unit: Literal["quintal"] = "quintal"
    as_of: str
    markets: list[MarketPrice]
    trend: list[PricePoint]
    trend_market: str
    change_pct7d: float = Field(alias="changePct7d")


class SellAdviceRequest(ApiInput):
    commodity: CommodityId
    quantity_quintals: float = Field(gt=0, le=10_000)
    lat: Lat
    lon: Lon
    lang: Lang

    @field_validator("lat", "lon")
    @classmethod
    def _round(cls, v: float) -> float:
        return round_coord(v)


class SellOption(ApiModel):
    market: str
    modal_price: int
    distance_km: float
    transport_cost: int
    net_earning: int


class SellAdvice(ApiModel):
    recommendation: Literal["SELL_NOW", "WAIT"]
    best_market: str
    net_earning: int
    options: list[SellOption]
    trend_slope: float
    reasoning: str


# ---- AI ----------------------------------------------------------------------


class Treatment(ApiModel):
    organic: list[str]
    chemical: list[str]


class CropDiagnosis(ApiModel):
    diagnosis: str
    scientific_name: str | None
    confidence: float
    severity: Literal["low", "medium", "high"]
    symptoms: list[str]
    treatment: Treatment
    prevention: list[str]
    escalate: bool
    model: str


class DosePerTank(ApiModel):
    amount: float
    unit: Literal["ml", "g"]


class LabelReading(ApiModel):
    product_name: str
    active_ingredient: str
    formulation: str | None
    dose_per_tank: DosePerTank | None
    tank_size_litres: float
    waiting_period_days: int | None
    safety: list[str]
    warnings: list[str]
    confidence: float
    escalate: bool
    model: str


class Deadline(ApiModel):
    label: str
    date: str


class DocumentExplanation(ApiModel):
    doc_type: str
    summary: str
    key_points: list[str]
    deadlines: list[Deadline]
    next_steps: list[str]
    redacted_fields: list[str]
    model: str


class VoiceContext(ApiInput):
    screen: Annotated[str, StringConstraints(max_length=40)] = "home"
    form_fields: list[Annotated[str, StringConstraints(max_length=40)]] | None = Field(
        default=None, max_length=20
    )


class VoiceResponse(ApiModel):
    transcript: str
    reply: str
    intent: Literal["navigate", "question", "fill_form", "unknown"]
    navigate_to: str | None
    slots: dict[str, str]
    escalate: bool
    model: str


# ---- Calendar ----------------------------------------------------------------


class TimelineWeek(ApiModel):
    week: int
    title: str
    tasks: list[str]


class SowingWindow(ApiModel):
    from_: str = Field(alias="from")
    to: str


class CropRecommendation(ApiModel):
    crop: str
    name: str
    suitability: Literal["high", "medium", "low"]
    sowing_window: SowingWindow
    duration_days: int
    why: str
    timeline: list[TimelineWeek]


class CalendarResponse(ApiModel):
    season: Season
    recommendations: list[CropRecommendation]


# ---- Schemes -----------------------------------------------------------------


class SchemeAnswers(ApiInput):
    owns_land: bool
    land_acres: float = Field(ge=0, le=10_000)
    category: Literal["general", "obc", "sc", "st"]
    has_bank_account: bool
    has_aadhaar: bool
    is_woman: bool
    irrigation: Irrigation
    income_tax_payer: bool


class SchemeMatchRequest(ApiInput):
    answers: SchemeAnswers
    lang: Lang = "mr"


class SchemeResult(ApiModel):
    id: str
    name: str
    eligible: bool
    reasons: list[str]
    benefit: str
    documents: list[str]
    official_url: str


class SchemeMatch(ApiModel):
    schemes: list[SchemeResult]
