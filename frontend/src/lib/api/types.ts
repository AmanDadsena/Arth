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
  /** never asked: the backend fills it from the district unless soilSource is 'farmer' */
  soilType: SoilType
  soilSource?: 'auto' | 'farmer'
  /** the main source, used by the advisories; with several, the most controlled one */
  irrigation: Irrigation
  /** every source the farmer uses (onboarding is multi-choice); older profiles lack it */
  waterSources?: Irrigation[]
  tankSizeLitres: number
  consentAt: string | null
  // basic questions asked right after sign-in — all optional, older profiles lack them
  experienceYears?: number
  landOwnership?: 'own' | 'lease' | 'both'
  farmingType?: 'conventional' | 'organic' | 'mixed'
  goals?: string[] // 'more_yield' | 'better_price' | 'less_cost' | 'save_water' | 'schemes' | 'organic'
  sellsAt?: string[] // 'mandi' | 'trader' | 'fpo' | 'direct' | 'contract'
  livestock?: string[] // 'cow' | 'buffalo' | 'goat' | 'poultry' | 'none'
  /** onboarding questions version answered; below the current one the app asks them again */
  onboardedVersion?: number
  createdAt?: string
  updatedAt?: string
}

export type FarmerProfileInput = Omit<FarmerProfile, 'createdAt' | 'updatedAt' | 'soilType'> & { soilType?: SoilType }

export interface DeleteResult {
  deleted: true
}

// ---- Brief ---------------------------------------------------------------

export interface Brief {
  greeting: string
  date: string
  location: string
  current: CurrentWeather | null
  weather: WeatherDay[]
  actions: ActionItem[]
  priceAlerts: PriceAlert[]
  /** the farmer's own crops and their usual stage today */
  inField: FieldCrop[]
  seasonNow: SeasonNow | null
  toolCalls: ToolCallLog[]
}

/** One of the farmer's crops and where it typically stands on today's date. */
export interface FieldCrop {
  crop: string
  name: string
  phase: 'sow' | 'grow' | 'protect' | 'harvest' | 'rest'
  stage: string
  task: string
  stageFrom: string
  stageTo: string
  progress: number
  /** the crop's whole typical year, for the year map; MM-DD, `end` may cross the new year */
  year: { start: string; end: string; phase: FieldCrop['phase']; name: string }[]
}

export interface SeasonNow {
  season: Season
  name: string
  progress: number
  daysLeft: number
  nextSeason: Season
  nextStarts: string
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

export interface CurrentWeather {
  tempC: number
  feelsLikeC: number
  humidity: number
  windKmh: number
  rainProb: number
  condition: WeatherCondition
}

export interface Weather {
  location: string
  current: CurrentWeather
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

export interface NewsItem {
  headline: string
  source: string
  url: string
  date: string
}

/** Why this crop, now: live weather and mandi signals, district soil, dated sourced news. */
export interface WhyNow {
  weather: string[]
  market: string[]
  soil?: string[]
  news: NewsItem[]
}

export interface CropRecommendation {
  crop: string
  name: string
  suitability: 'high' | 'medium' | 'low'
  sowingWindow: { from: string; to: string }
  /** 'onset': a kharif window moved to the district's monsoon onset (IMD record) */
  windowBasis?: 'onset' | 'calendar'
  /** open: `days` left to sow; upcoming: `days` until it opens */
  status?: { phase: 'open' | 'upcoming'; days: number }
  durationDays: number
  why: string
  whyNow?: WhyNow | null
  timeline: TimelineWeek[]
}

export interface MonsoonOnset {
  district: string
  expected: string
  oldDate: string
  shiftDays: number
  significant: boolean
  years: string
}

export interface SeasonSpan {
  season: Season
  name: string
  start: string // MM-DD
  end: string
}

export interface CalendarResponse {
  season: Season
  today: string
  currentSeason: Season | null
  seasonNow: SeasonNow | null
  seasons: SeasonSpan[]
  onset: MonsoonOnset | null
  inField: FieldCrop[]
  recommendations: CropRecommendation[]
}

// ---- Soil (from the location, never asked) ---------------------------------

export interface NutrientShares {
  low: number
  medium: number
  high: number
}

/** District Soil Health Card results: the odds for this farm, not a reading of it. */
export interface SoilReport {
  district: string
  districtLocal: string
  soilType: SoilType
  basis: 'district'
  cycle: string | null
  samples: number
  nitrogen: NutrientShares | null
  phosphorus: NutrientShares | null
  potassium: NutrientShares | null
  organicCarbon: NutrientShares | null
  deficient: Record<string, number>
  tips: string[]
  source: string
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

/** Opt-in anonymous share of scheme interest. No name, village or bank field exists. */
export interface ShareRequest {
  schemeId: string
  district?: string
  crop?: string
  landAcres?: number
  lang: Lang
}

/** Exactly what left the device (district, crop matched to fixed lists; land as a range). */
export interface SharedRecord {
  recordId: string
  schemeId: string
  district: string | null
  crop: string | null
  landBand: '0-1' | '1-2' | '2-5' | '5-10' | '10+' | null
  lang: Lang
  day: string
}

export interface ShareResult {
  /** queued: offline now, the backend sends it when the internet is back */
  status: 'sent' | 'queued'
  shared: SharedRecord
}

export interface Health {
  ok: boolean
  model: string
  modelReady: boolean
  /** anonymous sharing is set up on this backend */
  cloudSync: boolean
}
