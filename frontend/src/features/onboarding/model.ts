import { round2 } from '@/lib/api/queries'
import type { FarmerProfile, FarmerProfileInput, Irrigation, Lang, SoilType } from '@/lib/api/types'

/**
 * The onboarding question flow as data: which questions, in what order, the
 * answer options, the draft being filled in, and how it becomes a profile.
 * The screens in this folder only render what is described here.
 */

export type Ownership = NonNullable<FarmerProfile['landOwnership']>
export type FarmingType = NonNullable<FarmerProfile['farmingType']>

export type QuestionId =
  | 'lang'
  | 'name'
  | 'where'
  | 'crops'
  | 'land'
  | 'ownership'
  | 'soil'
  | 'water'
  | 'tank'
  | 'experience'
  | 'farmingType'
  | 'goals'
  | 'sellsAt'
  | 'livestock'

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
  { id: 'ownership', emoji: '🏡', optional: true, autoAdvance: true },
  { id: 'soil', emoji: '🟤', optional: true, autoAdvance: true },
  { id: 'water', emoji: '💧', optional: true, autoAdvance: true },
  { id: 'tank', emoji: '🎒', optional: true, autoAdvance: true },
  { id: 'experience', emoji: '⏳', optional: true, autoAdvance: true },
  { id: 'farmingType', emoji: '🍃', optional: true, autoAdvance: true },
  { id: 'goals', emoji: '🎯', optional: true, autoAdvance: false },
  { id: 'sellsAt', emoji: '🏪', optional: true, autoAdvance: false },
  { id: 'livestock', emoji: '🐄', optional: true, autoAdvance: false },
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

/** Soil is shown as a colour swatch — easier to recognise than a word. */
export const SOILS: { value: SoilType; swatch: string }[] = [
  { value: 'black', swatch: '#2f2a24' },
  { value: 'red', swatch: '#a4462b' },
  { value: 'alluvial', swatch: '#b59a72' },
  { value: 'laterite', swatch: '#8a4426' },
  { value: 'sandy', swatch: '#dcc38e' },
  { value: 'clay', swatch: '#7a6550' },
]

export const WATER: Opt<Irrigation>[] = [
  { value: 'rainfed', emoji: '🌧️' },
  { value: 'drip', emoji: '💧' },
  { value: 'sprinkler', emoji: '⛲' },
  { value: 'canal', emoji: '🏞️' },
  { value: 'borewell', emoji: '🚰' },
]

export const TANKS = [10, 12, 15, 16, 20]

export const OWNERSHIP: Opt<Ownership>[] = [
  { value: 'own', emoji: '🏡' },
  { value: 'lease', emoji: '🤝' },
  { value: 'both', emoji: '🔀' },
]

/** Experience is asked in buckets; each stores a representative number of years. */
export const EXPERIENCE: { id: string; years: number; emoji: string }[] = [
  { id: 'lt2', years: 1, emoji: '🌱' },
  { id: '2to5', years: 3, emoji: '🌿' },
  { id: '5to10', years: 7, emoji: '🌾' },
  { id: '10to20', years: 15, emoji: '🌳' },
  { id: '20plus', years: 25, emoji: '🏅' },
]

export function experienceBucket(years: number | undefined) {
  if (years === undefined) return undefined
  if (years < 2) return EXPERIENCE[0]!
  if (years < 5) return EXPERIENCE[1]!
  if (years < 10) return EXPERIENCE[2]!
  if (years < 20) return EXPERIENCE[3]!
  return EXPERIENCE[4]!
}

export const FARMING: Opt<FarmingType>[] = [
  { value: 'conventional', emoji: '🧪' },
  { value: 'organic', emoji: '🍃' },
  { value: 'mixed', emoji: '⚖️' },
]

export const GOALS: Opt[] = [
  { value: 'more_yield', emoji: '🌾' },
  { value: 'better_price', emoji: '💰' },
  { value: 'less_cost', emoji: '🪙' },
  { value: 'save_water', emoji: '💧' },
  { value: 'schemes', emoji: '🏛️' },
  { value: 'organic', emoji: '🍃' },
]

export const SELLS: Opt[] = [
  { value: 'mandi', emoji: '🏪' },
  { value: 'trader', emoji: '🤝' },
  { value: 'fpo', emoji: '👥' },
  { value: 'direct', emoji: '🧺' },
  { value: 'contract', emoji: '📝' },
]

export const LIVESTOCK: Opt[] = [
  { value: 'cow', emoji: '🐄' },
  { value: 'buffalo', emoji: '🐃' },
  { value: 'goat', emoji: '🐐' },
  { value: 'poultry', emoji: '🐔' },
  { value: 'none', emoji: '🚫' },
]

/** Defaults used when an optional farm question is skipped. */
export const DEFAULTS = { soilType: 'black' as SoilType, irrigation: 'rainfed' as Irrigation, tankSizeLitres: 15 }

/** District centres, used when the farmer picks a district instead of sharing location. */
export const DISTRICTS: Record<string, [number, number]> = {
  Nashik: [20.0, 73.79],
  Pune: [18.52, 73.86],
  Ahmednagar: [19.09, 74.74],
  'Chhatrapati Sambhajinagar': [19.88, 75.34],
  Jalgaon: [21.0, 75.56],
  Dhule: [20.9, 74.77],
  Solapur: [17.66, 75.91],
  Satara: [17.68, 74.0],
  Sangli: [16.85, 74.58],
  Kolhapur: [16.7, 74.24],
  Latur: [18.4, 76.57],
  Beed: [18.99, 75.76],
  Jalna: [19.84, 75.88],
  Amravati: [20.93, 77.75],
  Akola: [20.7, 77.0],
  Nagpur: [21.15, 79.09],
}

/** The listed district whose centre is closest, if the point is plausibly inside it. */
export function nearestDistrict(lat: number, lon: number): string | undefined {
  let best: string | undefined
  let bestD = Infinity
  for (const [name, [la, lo]] of Object.entries(DISTRICTS)) {
    const d = (la - lat) ** 2 + (lo - lon) ** 2
    if (d < bestD) {
      bestD = d
      best = name
    }
  }
  // ~0.8° ≈ 90 km: beyond that the farmer is in a district we don't list
  return bestD <= 0.8 ** 2 ? best : undefined
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
  landOwnership?: Ownership
  soilType?: SoilType
  irrigation?: Irrigation
  tankSizeLitres?: number
  experienceYears?: number
  farmingType?: FarmingType
  goals: string[]
  sellsAt: string[]
  livestock: string[]
}

export function initialDraft(existing: FarmerProfile | undefined, displayName: string): Draft {
  const district = existing?.district ?? 'Nashik'
  const centre = DISTRICTS[district] ?? DISTRICTS.Nashik!
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
    landOwnership: existing?.landOwnership,
    soilType: existing?.soilType,
    irrigation: existing?.irrigation,
    tankSizeLitres: existing?.tankSizeLitres,
    experienceYears: existing?.experienceYears,
    farmingType: existing?.farmingType,
    goals: existing?.goals ?? [],
    sellsAt: existing?.sellsAt ?? [],
    livestock: existing?.livestock ?? [],
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
    case 'ownership':
      return d.landOwnership !== undefined
    case 'soil':
      return d.soilType !== undefined
    case 'water':
      return d.irrigation !== undefined
    case 'tank':
      return d.tankSizeLitres !== undefined
    case 'experience':
      return d.experienceYears !== undefined
    case 'farmingType':
      return d.farmingType !== undefined
    case 'goals':
      return d.goals.length > 0
    case 'sellsAt':
      return d.sellsAt.length > 0
    case 'livestock':
      return d.livestock.length > 0
  }
}

/** First required question still missing an answer, or -1. */
export function firstMissing(d: Draft): number {
  return QUESTIONS.findIndex((q) => !q.optional && !isAnswered(q.id, d))
}

/** Toggle in a multi-select; `exclusive` values (like "no animals") clear the rest. */
export function toggle(list: string[], value: string, exclusive: string[] = []): string[] {
  if (list.includes(value)) return list.filter((x) => x !== value)
  if (exclusive.includes(value)) return [value]
  return [...list.filter((x) => !exclusive.includes(x)), value]
}

const nonEmpty = (xs: string[]) => (xs.length ? xs : undefined)

export function toProfileInput(d: Draft, lang: Lang, consentAt: string | null): FarmerProfileInput {
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
    soilType: d.soilType ?? DEFAULTS.soilType,
    irrigation: d.irrigation ?? DEFAULTS.irrigation,
    tankSizeLitres: d.tankSizeLitres ?? DEFAULTS.tankSizeLitres,
    consentAt,
    landOwnership: d.landOwnership,
    experienceYears: d.experienceYears,
    farmingType: d.farmingType,
    goals: nonEmpty(d.goals),
    sellsAt: nonEmpty(d.sellsAt),
    livestock: nonEmpty(d.livestock),
  }
}
