import { round2 } from '@/lib/api/queries'
import type { FarmerProfile, FarmerProfileInput, Irrigation, Lang } from '@/lib/api/types'

/**
 * The onboarding question flow as data: which questions, in what order, the
 * answer options, the draft being filled in, and how it becomes a profile.
 * The screens in this folder only render what is described here.
 *
 * Six questions, nothing a farmer has to look up. Soil is never asked: the
 * backend reads it from the district (Soil Health Card data), the way Rutu does.
 * The optional "about you" questions and the sprayer tank live in Settings.
 */

export type QuestionId = 'lang' | 'name' | 'where' | 'crops' | 'land' | 'water'

export interface QuestionDef {
  id: QuestionId
  emoji: string
  /** optional questions show "Skip" */
  optional: boolean
  /** single-choice questions move on by themselves after a tap */
  autoAdvance: boolean
}

export const QUESTIONS: QuestionDef[] = [
  { id: 'lang', emoji: '🙏', optional: false, autoAdvance: false },
  { id: 'name', emoji: '👋', optional: false, autoAdvance: false },
  { id: 'where', emoji: '📍', optional: false, autoAdvance: false },
  { id: 'crops', emoji: '🌾', optional: false, autoAdvance: false },
  { id: 'land', emoji: '📐', optional: false, autoAdvance: false },
  { id: 'water', emoji: '💧', optional: true, autoAdvance: true },
]

/** Index of the summary screen, one past the last question. */
export const REVIEW = QUESTIONS.length

export interface Opt<T extends string | number = string> {
  value: T
  emoji: string
}

export const CROPS: Opt[] = [
  { value: 'onion', emoji: '🧅' },
  { value: 'soybean', emoji: '🌱' },
  { value: 'tomato', emoji: '🍅' },
  { value: 'grapes', emoji: '🍇' },
  { value: 'cotton', emoji: '🌼' },
  { value: 'wheat', emoji: '🌾' },
  { value: 'gram', emoji: '🌰' },
  { value: 'sugarcane', emoji: '🎋' },
  { value: 'pomegranate', emoji: '🍎' },
  { value: 'maize', emoji: '🌽' },
]

export const WATER: Opt<Irrigation>[] = [
  { value: 'rainfed', emoji: '🌧️' },
  { value: 'drip', emoji: '💧' },
  { value: 'sprinkler', emoji: '⛲' },
  { value: 'canal', emoji: '🏞️' },
  { value: 'borewell', emoji: '🚰' },
]

/** Defaults for what onboarding doesn't ask (water can be skipped; the tank is set in Settings). */
export const DEFAULTS = { irrigation: 'rainfed' as Irrigation, tankSizeLitres: 15 }

/** Every district of Maharashtra and its centre (used when the farmer picks one instead of sharing location). */
export const DISTRICTS: Record<string, { lat: number; lon: number; dev: string }> = {
  Ahmednagar: { lat: 19.1, lon: 74.75, dev: 'अहमदनगर' },
  Akola: { lat: 20.71, lon: 77.0, dev: 'अकोला' },
  Amravati: { lat: 20.93, lon: 77.75, dev: 'अमरावती' },
  Beed: { lat: 18.99, lon: 75.76, dev: 'बीड' },
  Bhandara: { lat: 21.17, lon: 79.65, dev: 'भंडारा' },
  Buldhana: { lat: 20.53, lon: 76.18, dev: 'बुलढाणा' },
  Chandrapur: { lat: 19.95, lon: 79.3, dev: 'चंद्रपूर' },
  'Chhatrapati Sambhajinagar': { lat: 19.88, lon: 75.34, dev: 'छत्रपती संभाजीनगर' },
  Dharashiv: { lat: 18.19, lon: 76.04, dev: 'धाराशिव' },
  Dhule: { lat: 20.9, lon: 74.77, dev: 'धुळे' },
  Gadchiroli: { lat: 20.18, lon: 80.0, dev: 'गडचिरोली' },
  Gondia: { lat: 21.46, lon: 80.2, dev: 'गोंदिया' },
  Hingoli: { lat: 19.72, lon: 77.15, dev: 'हिंगोली' },
  Jalgaon: { lat: 21.01, lon: 75.56, dev: 'जळगाव' },
  Jalna: { lat: 19.84, lon: 75.88, dev: 'जालना' },
  Kolhapur: { lat: 16.7, lon: 74.24, dev: 'कोल्हापूर' },
  Latur: { lat: 18.4, lon: 76.57, dev: 'लातूर' },
  'Mumbai City': { lat: 18.94, lon: 72.83, dev: 'मुंबई शहर' },
  'Mumbai Suburban': { lat: 19.15, lon: 72.85, dev: 'मुंबई उपनगर' },
  Nagpur: { lat: 21.15, lon: 79.09, dev: 'नागपूर' },
  Nanded: { lat: 19.15, lon: 77.32, dev: 'नांदेड' },
  Nandurbar: { lat: 21.37, lon: 74.24, dev: 'नंदुरबार' },
  Nashik: { lat: 20.0, lon: 73.79, dev: 'नाशिक' },
  Palghar: { lat: 19.7, lon: 72.77, dev: 'पालघर' },
  Parbhani: { lat: 19.27, lon: 76.78, dev: 'परभणी' },
  Pune: { lat: 18.52, lon: 73.86, dev: 'पुणे' },
  Raigad: { lat: 18.51, lon: 73.18, dev: 'रायगड' },
  Ratnagiri: { lat: 16.99, lon: 73.3, dev: 'रत्नागिरी' },
  Sangli: { lat: 16.85, lon: 74.58, dev: 'सांगली' },
  Satara: { lat: 17.69, lon: 74.0, dev: 'सातारा' },
  Sindhudurg: { lat: 16.13, lon: 73.66, dev: 'सिंधुदुर्ग' },
  Solapur: { lat: 17.66, lon: 75.91, dev: 'सोलापूर' },
  Thane: { lat: 19.22, lon: 72.98, dev: 'ठाणे' },
  Wardha: { lat: 20.75, lon: 78.6, dev: 'वर्धा' },
  Washim: { lat: 20.11, lon: 77.13, dev: 'वाशिम' },
  Yavatmal: { lat: 20.39, lon: 78.13, dev: 'यवतमाळ' },
}

/** District name in the farmer's script. */
export const districtLabel = (d: string, lang: Lang) => (lang === 'en' ? d : (DISTRICTS[d]?.dev ?? d))

/** The district whose centre is closest, if the point is plausibly inside Maharashtra. */
export function nearestDistrict(lat: number, lon: number): string | undefined {
  let best: string | undefined
  let bestD = Infinity
  for (const [name, c] of Object.entries(DISTRICTS)) {
    const dist = (c.lat - lat) ** 2 + (c.lon - lon) ** 2
    if (dist < bestD) {
      bestD = dist
      best = name
    }
  }
  // ~1° ≈ 110 km: beyond that the farmer is outside the state
  return bestD <= 1 ? best : undefined
}

export interface Draft {
  name: string
  village: string
  district: string
  lat: number
  lon: number
  /** true once the point came from the phone's location, not a district centre */
  located: boolean
  crops: string[]
  landAcres: number
  irrigation?: Irrigation
}

export function initialDraft(existing: FarmerProfile | undefined, displayName: string): Draft {
  const district = existing?.district ?? 'Nashik'
  const c = DISTRICTS[district] ?? DISTRICTS.Nashik!
  const centre = [c.lat, c.lon] as const
  const lat = existing?.lat ?? centre[0]
  const lon = existing?.lon ?? centre[1]
  return {
    name: existing?.name ?? displayName,
    village: existing?.village ?? '',
    district,
    lat,
    lon,
    // a saved point that isn't the district centre must have come from GPS
    located: !!existing && (round2(lat) !== round2(centre[0]) || round2(lon) !== round2(centre[1])),
    crops: existing?.crops ?? [],
    landAcres: existing?.landAcres ?? 2,
    irrigation: existing?.irrigation,
  }
}

/** Whether a question has an answer that lets the farmer move on. */
export function isAnswered(id: QuestionId, d: Draft): boolean {
  switch (id) {
    case 'lang':
      return true
    case 'name':
      return d.name.trim().length > 0
    case 'where':
      return d.village.trim().length > 0 && d.district.trim().length > 0
    case 'crops':
      return d.crops.length > 0
    case 'land':
      return d.landAcres > 0
    case 'water':
      return d.irrigation !== undefined
  }
}

/** First required question still missing an answer, or -1. */
export function firstMissing(d: Draft): number {
  return QUESTIONS.findIndex((q) => !q.optional && !isAnswered(q.id, d))
}

/** Toggle in a multi-select. */
export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

/**
 * The draft as a profile. What onboarding does not ask is carried over from the
 * saved profile when editing (tank, a farmer's own soil correction, the
 * optional basics); soil is otherwise left for the backend to fill in.
 */
export function toProfileInput(d: Draft, lang: Lang, consentAt: string | null, existing?: FarmerProfile): FarmerProfileInput {
  const keepSoil = existing?.soilSource === 'farmer'
  return {
    name: d.name.trim(),
    lang,
    village: d.village.trim(),
    district: d.district,
    state: 'Maharashtra',
    lat: round2(d.lat),
    lon: round2(d.lon),
    crops: d.crops,
    landAcres: round2(d.landAcres),
    ...(keepSoil ? { soilType: existing.soilType, soilSource: 'farmer' as const } : { soilSource: 'auto' as const }),
    irrigation: d.irrigation ?? DEFAULTS.irrigation,
    tankSizeLitres: existing?.tankSizeLitres ?? DEFAULTS.tankSizeLitres,
    consentAt,
    landOwnership: existing?.landOwnership,
    experienceYears: existing?.experienceYears,
    farmingType: existing?.farmingType,
    goals: existing?.goals,
    sellsAt: existing?.sellsAt,
    livestock: existing?.livestock,
  }
}
