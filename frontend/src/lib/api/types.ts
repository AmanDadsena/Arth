/**
 * The API contract, exactly as docs/SPEC.md §3 defines it. The backend's
 * pydantic models mirror this file; change both or neither.
 */

export type Lang = 'en' | 'hi' | 'mr'
export type Season = 'kharif' | 'rabi' | 'zaid'
export type SoilType = 'black' | 'red' | 'alluvial' | 'laterite' | 'sandy' | 'clay'
export type Irrigation = 'rainfed' | 'drip' | 'sprinkler' | 'canal' | 'borewell'
export type Priority = 'high' | 'medium' | 'low'

export interface ApiErrorBody {
  error: { code: string; message: string }
}

// ---- Farmer profile ------------------------------------------------------

export interface FarmerProfile {
  name: string
  lang: Lang
  village: string
  district: string
  state: string
  lat: number
  lon: number
  crops: string[]
  landAcres: number
  soilType: SoilType
  irrigation: Irrigation
  tankSizeLitres: number
  consentAt: string | null
  createdAt?: string
  updatedAt?: string
}

export type FarmerProfileInput = Omit<FarmerProfile, 'createdAt' | 'updatedAt'>

export interface DeleteResult {
  deleted: true
}

// ---- Brief ---------------------------------------------------------------

export interface Brief {
  greeting: string
  date: string
  weather: WeatherDay[]
  actions: ActionItem[]
  priceAlerts: PriceAlert[]
  toolCalls: ToolCallLog[]
}

export interface ActionItem {
  id: string
  type: 'spray' | 'irrigate' | 'harvest' | 'sell' | 'sow' | 'protect' | 'scheme'
  priority: Priority
  title: string
  detail: string
  source: 'weather' | 'mandi' | 'calendar'
  route: string | null
}

export interface PriceAlert {
  commodity: string
  market: string
  modalPrice: number
  changePct: number
  direction: 'up' | 'down' | 'flat'
}

export interface ToolCallLog {
  name: string
  args: Record<string, unknown>
  ms: number
}

// ---- Weather -------------------------------------------------------------

export type WeatherCondition =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'thunderstorm'
  | 'fog'

export interface WeatherDay {
  date: string
  minC: number
  maxC: number
  rainProb: number
  rainMm: number
  windKmh: number
  condition: WeatherCondition
}

export interface Advisory {
  id: string
  severity: 'danger' | 'warning' | 'info'
  rule: 'rain_no_spray' | 'heat_irrigate' | 'wind_no_spray' | 'other'
  title: string
  detail: string
  date: string
}

export interface Weather {
  location: string
  current: {
    tempC: number
    feelsLikeC: number
    humidity: number
    windKmh: number
    rainProb: number
    condition: WeatherCondition
  }
  daily: WeatherDay[]
  advisories: Advisory[]
}

// ---- Mandi ---------------------------------------------------------------

export interface MarketPrice {
  market: string
  district: string
  minPrice: number
  maxPrice: number
  modalPrice: number
  distanceKm: number
  arrivalDate: string
}

export interface PricePoint {
  date: string
  modalPrice: number
}

export interface MandiPrices {
  commodity: string
  unit: 'quintal'
  asOf: string
  markets: MarketPrice[]
  trend: PricePoint[]
  trendMarket: string
  changePct7d: number
}

export interface SellAdviceRequest {
  commodity: string
  quantityQuintals: number
  lat: number
  lon: number
  lang: Lang
}

export interface SellOption {
  market: string
  modalPrice: number
  distanceKm: number
  transportCost: number
  netEarning: number
}

export interface SellAdvice {
  recommendation: 'SELL_NOW' | 'WAIT'
  bestMarket: string
  netEarning: number
  options: SellOption[]
  trendSlope: number
  reasoning: string
}

// ---- AI ------------------------------------------------------------------

export interface CropDiagnosis {
  diagnosis: string
  scientificName: string | null
  confidence: number
  severity: 'low' | 'medium' | 'high'
  symptoms: string[]
  treatment: { organic: string[]; chemical: string[] }
  prevention: string[]
  escalate: boolean
  model: string
}

export interface LabelReading {
  productName: string
  activeIngredient: string
  formulation: string | null
  dosePerTank: { amount: number; unit: 'ml' | 'g' } | null
  tankSizeLitres: number
  waitingPeriodDays: number | null
  safety: string[]
  warnings: string[]
  confidence: number
  escalate: boolean
  model: string
}

export interface DocumentExplanation {
  docType: string
  summary: string
  keyPoints: string[]
  deadlines: { label: string; date: string }[]
  nextSteps: string[]
  redactedFields: string[]
  model: string
}

export interface VoiceContext {
  screen: string
  formFields?: string[]
}

export interface VoiceResponse {
  transcript: string
  reply: string
  intent: 'navigate' | 'question' | 'fill_form' | 'unknown'
  navigateTo: string | null
  slots: Record<string, string>
  escalate: boolean
  model: string
}

// ---- Calendar ------------------------------------------------------------

export interface TimelineWeek {
  week: number
  title: string
  tasks: string[]
}

export interface CropRecommendation {
  crop: string
  name: string
  suitability: 'high' | 'medium' | 'low'
  sowingWindow: { from: string; to: string }
  durationDays: number
  why: string
  timeline: TimelineWeek[]
}

export interface CalendarResponse {
  season: Season
  recommendations: CropRecommendation[]
}

// ---- Schemes -------------------------------------------------------------

export interface SchemeAnswers {
  ownsLand: boolean
  landAcres: number
  category: 'general' | 'obc' | 'sc' | 'st'
  hasBankAccount: boolean
  hasAadhaar: boolean
  isWoman: boolean
  irrigation: Irrigation
  incomeTaxPayer: boolean
}

export interface SchemeResult {
  id: string
  name: string
  eligible: boolean
  reasons: string[]
  benefit: string
  documents: string[]
  officialUrl: string
}

export interface SchemeMatch {
  schemes: SchemeResult[]
}
