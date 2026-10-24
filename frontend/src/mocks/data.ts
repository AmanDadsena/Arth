import type {
  ActionItem,
  Brief,
  CalendarResponse,
  CropDiagnosis,
  CropRecommendation,
  DocumentExplanation,
  Lang,
  LabelReading,
  MandiPrices,
  MarketPrice,
  PriceAlert,
  PricePoint,
  Priority,
  SchemeAnswers,
  SchemeMatch,
  SchemeResult,
  Season,
  SellAdvice,
  SellAdviceRequest,
  ToolCallLog,
  VoiceContext,
  VoiceResponse,
  Weather,
  WeatherDay,
} from '@/lib/api/types'
import { haversineKm } from '@/lib/live/cache'
import { addDaysIso, dayWord, daysBetween, shortDate, todayIso } from '@/lib/live/dates'
import { readPriceHistory, recordPrice, type LiveMandi, type LiveMandiRecord } from '@/lib/live/mandi'
import { advisories, seededForecast, SEEDED_CURRENT, type LiveWeather } from '@/lib/live/weather'

/**
 * Data for every endpoint. Weather (Open-Meteo) and mandi prices
 * (data.gov.in) are live when the device is online — see src/lib/live — and
 * fall back to the last cached copy, then to the seeded Maharashtra numbers
 * here (Niphad / Nashik district, Lasalgaon mandi). Every date is relative
 * to today in India.
 */

type T3 = { en: string; hi: string; mr: string }
const L = (s: T3, lang: Lang) => s[lang] ?? s.en
const LA = (items: T3[], lang: Lang) => items.map((s) => L(s, lang))

const MODEL = 'gemma-4'

/** tiny deterministic PRNG so seeded charts don't jump on every refetch */
function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return Math.abs(h) || 1
}
const rupees = (n: number) => Math.round(n).toLocaleString('en-IN')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---- Places --------------------------------------------------------------

type Place = { name: string; district: string; at: [number, number]; hi?: string; mr?: string }

/**
 * Maharashtra APMC markets (and sub-yards) with coordinates, keyed by a
 * lower-case letters-only id. A feed market not listed here falls back to its
 * district centre (DISTRICT_AT).
 */
const M = (name: string, district: string, lat: number, lon: number, hi?: string, mr?: string): Place => ({ name, district, at: [lat, lon], hi, mr })
export const MARKETS: Record<string, Place> = {
  // Nashik
  lasalgaon: M('Lasalgaon', 'Nashik', 20.15, 74.23, 'लासलगांव', 'लासलगाव'),
  vinchur: M('Vinchur', 'Nashik', 20.1, 74.23, 'विंचूर', 'विंचूर'),
  niphad: M('Niphad', 'Nashik', 20.08, 74.11, 'निफाड', 'निफाड'),
  pimpalgaonbaswant: M('Pimpalgaon Baswant', 'Nashik', 20.17, 73.99, 'पिंपलगांव बसवंत', 'पिंपळगाव बसवंत'),
  nashik: M('Nashik', 'Nashik', 20.0, 73.79, 'नासिक', 'नाशिक'),
  yeola: M('Yeola', 'Nashik', 20.04, 74.49, 'येवला', 'येवला'),
  sinnar: M('Sinnar', 'Nashik', 19.85, 74.0, 'सिन्नर', 'सिन्नर'),
  dindori: M('Dindori', 'Nashik', 20.2, 73.83, 'दिंडोरी', 'दिंडोरी'),
  vani: M('Vani', 'Nashik', 20.33, 73.89),
  malegaon: M('Malegaon', 'Nashik', 20.55, 74.53, 'मालेगांव', 'मालेगाव'),
  manmad: M('Manmad', 'Nashik', 20.25, 74.44, 'मनमाड', 'मनमाड'),
  chandwad: M('Chandwad', 'Nashik', 20.33, 74.25, 'चांदवड', 'चांदवड'),
  kalvan: M('Kalvan', 'Nashik', 20.5, 74.03),
  satana: M('Satana', 'Nashik', 20.6, 74.2),
  nandgaon: M('Nandgaon', 'Nashik', 20.31, 74.66),
  umrane: M('Umrane', 'Nashik', 20.43, 74.33),
  devala: M('Devala', 'Nashik', 20.48, 74.17),
  ghoti: M('Ghoti', 'Nashik', 19.72, 73.63),
  // Pune
  pune: M('Pune', 'Pune', 18.52, 73.86, 'पुणे', 'पुणे'),
  moshi: M('Moshi', 'Pune', 18.68, 73.85),
  pimpri: M('Pimpri', 'Pune', 18.63, 73.8),
  chakan: M('Chakan', 'Pune', 18.76, 73.86),
  khed: M('Khed', 'Pune', 18.85, 73.88),
  manchar: M('Manchar', 'Pune', 19.0, 73.94),
  junnar: M('Junnar', 'Pune', 19.2, 73.88),
  otur: M('Otur', 'Pune', 19.27, 73.99),
  baramati: M('Baramati', 'Pune', 18.15, 74.58),
  indapur: M('Indapur', 'Pune', 18.12, 75.02),
  shirur: M('Shirur', 'Pune', 18.83, 74.37),
  daund: M('Daund', 'Pune', 18.46, 74.58),
  // Mumbai / Thane / Raigad
  vashi: M('Vashi (Mumbai)', 'Thane', 19.08, 73.0, 'वाशी (मुंबई)', 'वाशी (मुंबई)'),
  mumbai: M('Mumbai', 'Mumbai', 19.08, 73.0, 'मुंबई', 'मुंबई'),
  kalyan: M('Kalyan', 'Thane', 19.24, 73.13),
  thane: M('Thane', 'Thane', 19.22, 72.98),
  ulhasnagar: M('Ulhasnagar', 'Thane', 19.22, 73.16),
  panvel: M('Panvel', 'Raigad', 18.99, 73.11),
  palghar: M('Palghar', 'Palghar', 19.7, 72.77),
  // Ahilyanagar
  ahilyanagar: M('Ahilyanagar', 'Ahilyanagar', 19.09, 74.74),
  kopargaon: M('Kopargaon', 'Ahilyanagar', 19.88, 74.48),
  rahata: M('Rahata', 'Ahilyanagar', 19.71, 74.48),
  shrirampur: M('Shrirampur', 'Ahilyanagar', 19.62, 74.66),
  rahuri: M('Rahuri', 'Ahilyanagar', 19.39, 74.65),
  vambori: M('Vambori', 'Ahilyanagar', 19.29, 74.73),
  sangamner: M('Sangamner', 'Ahilyanagar', 19.57, 74.21),
  akole: M('Akole', 'Ahilyanagar', 19.54, 74.0),
  shevgaon: M('Shevgaon', 'Ahilyanagar', 19.35, 75.23),
  bodhegaon: M('Bodhegaon', 'Ahilyanagar', 19.3, 75.4),
  pathardi: M('Pathardi', 'Ahilyanagar', 19.17, 75.18),
  karjat: M('Karjat', 'Ahilyanagar', 18.91, 75.01),
  jamkhed: M('Jamkhed', 'Ahilyanagar', 18.72, 75.31),
  parner: M('Parner', 'Ahilyanagar', 19.0, 74.44),
  newasa: M('Newasa', 'Ahilyanagar', 19.55, 74.93),
  shrigonda: M('Shrigonda', 'Ahilyanagar', 18.62, 74.7),
  // Solapur / Sangli / Satara / Kolhapur
  solapur: M('Solapur', 'Solapur', 17.66, 75.91),
  mangalwedha: M('Mangalwedha', 'Solapur', 17.51, 75.47),
  pandharpur: M('Pandharpur', 'Solapur', 17.68, 75.33),
  barshi: M('Barshi', 'Solapur', 18.23, 75.69),
  akluj: M('Akluj', 'Solapur', 17.89, 75.02),
  kurduwadi: M('Kurduwadi', 'Solapur', 18.09, 75.42),
  sangli: M('Sangli', 'Sangli', 16.85, 74.58),
  tasgaon: M('Tasgaon', 'Sangli', 17.03, 74.6),
  islampur: M('Islampur', 'Sangli', 17.05, 74.27),
  vita: M('Vita', 'Sangli', 17.27, 74.54),
  satara: M('Satara', 'Satara', 17.69, 74.0),
  karad: M('Karad', 'Satara', 17.29, 74.18),
  vaduj: M('Vaduj', 'Satara', 17.59, 74.45),
  phaltan: M('Phaltan', 'Satara', 17.99, 74.43),
  koregaon: M('Koregaon', 'Satara', 17.7, 74.16),
  lonand: M('Lonand', 'Satara', 18.04, 74.18),
  wai: M('Wai', 'Satara', 17.95, 73.89),
  kolhapur: M('Kolhapur', 'Kolhapur', 16.7, 74.24),
  // Marathwada
  latur: M('Latur', 'Latur', 18.4, 76.57, 'लातूर', 'लातूर'),
  ausa: M('Ausa', 'Latur', 18.25, 76.5),
  udgir: M('Udgir', 'Latur', 18.39, 77.12),
  nilanga: M('Nilanga', 'Latur', 18.12, 76.75),
  auradshahajani: M('Aurad Shahajani', 'Latur', 18.08, 76.94),
  murud: M('Murud', 'Latur', 18.32, 76.39),
  chakur: M('Chakur', 'Latur', 18.51, 76.88),
  chhatrapatisambhajinagar: M('Chhatrapati Sambhajinagar', 'Chhatrapati Sambhajinagar', 19.88, 75.34),
  vaijpur: M('Vaijpur', 'Chhatrapati Sambhajinagar', 19.93, 74.73),
  gangapur: M('Gangapur', 'Chhatrapati Sambhajinagar', 19.7, 75.01),
  paithan: M('Paithan', 'Chhatrapati Sambhajinagar', 19.48, 75.38),
  kannad: M('Kannad', 'Chhatrapati Sambhajinagar', 20.26, 75.13),
  lasur: M('Lasur', 'Chhatrapati Sambhajinagar', 19.92, 75.05),
  sillod: M('Sillod', 'Chhatrapati Sambhajinagar', 20.3, 75.65),
  jalna: M('Jalna', 'Jalna', 19.84, 75.89),
  partur: M('Partur', 'Jalna', 19.6, 76.21),
  ambad: M('Ambad', 'Jalna', 19.61, 75.79),
  beed: M('Beed', 'Beed', 18.99, 75.76),
  gevrai: M('Gevrai', 'Beed', 19.26, 75.75),
  majalgaon: M('Majalgaon', 'Beed', 19.15, 76.21),
  kaij: M('Kaij', 'Beed', 18.71, 76.09),
  ambajogai: M('Ambajogai', 'Beed', 18.73, 76.38),
  dharashiv: M('Dharashiv', 'Dharashiv', 18.18, 76.04),
  tuljapur: M('Tuljapur', 'Dharashiv', 18.01, 76.07),
  murum: M('Murum', 'Dharashiv', 17.79, 76.47),
  kalamb: M('Kalamb', 'Dharashiv', 18.57, 76.02),
  omerga: M('Omerga', 'Dharashiv', 17.83, 76.62),
  nanded: M('Nanded', 'Nanded', 19.15, 77.31),
  loha: M('Loha', 'Nanded', 18.96, 77.12),
  mukhed: M('Mukhed', 'Nanded', 18.71, 77.37),
  kinwat: M('Kinwat', 'Nanded', 19.62, 78.2),
  bhokar: M('Bhokar', 'Nanded', 19.21, 77.67),
  hadgaon: M('Hadgaon', 'Nanded', 19.5, 77.66),
  deglur: M('Deglur', 'Nanded', 18.55, 77.57),
  parbhani: M('Parbhani', 'Parbhani', 19.27, 76.77),
  gangakhed: M('Gangakhed', 'Parbhani', 18.97, 76.75),
  selu: M('Selu', 'Parbhani', 19.45, 76.44),
  jintur: M('Jintur', 'Parbhani', 19.61, 76.69),
  purna: M('Purna', 'Parbhani', 19.18, 77.03),
  hingoli: M('Hingoli', 'Hingoli', 19.72, 77.15),
  basmat: M('Basmat', 'Hingoli', 19.33, 77.16),
  kalamnuri: M('Kalamnuri', 'Hingoli', 19.67, 77.32),
  // Khandesh
  jalgaon: M('Jalgaon', 'Jalgaon', 21.0, 75.56),
  amalner: M('Amalner', 'Jalgaon', 21.04, 75.06),
  chopda: M('Chopda', 'Jalgaon', 21.25, 75.3),
  pachora: M('Pachora', 'Jalgaon', 20.67, 75.35),
  bhusawal: M('Bhusawal', 'Jalgaon', 21.04, 75.79),
  chalisgaon: M('Chalisgaon', 'Jalgaon', 20.46, 75.01),
  raver: M('Raver', 'Jalgaon', 21.25, 76.03),
  yawal: M('Yawal', 'Jalgaon', 21.17, 75.7),
  dhule: M('Dhule', 'Dhule', 20.9, 74.77),
  shirpur: M('Shirpur', 'Dhule', 21.35, 74.88),
  sakri: M('Sakri', 'Dhule', 21.0, 74.32),
  dondaicha: M('Dondaicha', 'Dhule', 21.32, 74.57),
  nandurbar: M('Nandurbar', 'Nandurbar', 21.37, 74.24),
  shahada: M('Shahada', 'Nandurbar', 21.55, 74.47),
  // Vidarbha
  akola: M('Akola', 'Akola', 20.7, 77.0),
  murtizapur: M('Murtizapur', 'Akola', 20.73, 77.37),
  akot: M('Akot', 'Akola', 21.1, 77.06),
  amravati: M('Amravati', 'Amravati', 20.93, 77.75),
  dhamangaonrailway: M('Dhamangaon Railway', 'Amravati', 20.79, 78.13),
  anjangaon: M('Anjangaon', 'Amravati', 21.16, 77.31),
  achalpur: M('Achalpur', 'Amravati', 21.26, 77.51),
  nagpur: M('Nagpur', 'Nagpur', 21.15, 79.09),
  kalmeshwar: M('Kalmeshwar', 'Nagpur', 21.23, 78.92),
  kamthi: M('Kamthi', 'Nagpur', 21.22, 79.2),
  umred: M('Umred', 'Nagpur', 20.85, 79.33),
  savner: M('Savner', 'Nagpur', 21.39, 78.92),
  hingna: M('Hingna', 'Nagpur', 21.07, 78.97),
  katol: M('Katol', 'Nagpur', 21.27, 78.59),
  ramtek: M('Ramtek', 'Nagpur', 21.4, 79.33),
  wardha: M('Wardha', 'Wardha', 20.74, 78.6),
  pulgaon: M('Pulgaon', 'Wardha', 20.72, 78.32),
  arvi: M('Arvi', 'Wardha', 20.99, 78.23),
  hinganghat: M('Hinganghat', 'Wardha', 20.55, 78.84),
  yavatmal: M('Yavatmal', 'Yavatmal', 20.39, 78.12),
  ralegaon: M('Ralegaon', 'Yavatmal', 20.42, 78.53),
  wani: M('Wani', 'Yavatmal', 20.06, 78.95),
  pusad: M('Pusad', 'Yavatmal', 19.91, 77.57),
  digras: M('Digras', 'Yavatmal', 20.1, 77.72),
  chandrapur: M('Chandrapur', 'Chandrapur', 19.96, 79.3),
  bhadrawati: M('Bhadrawati', 'Chandrapur', 20.1, 79.12),
  warora: M('Warora', 'Chandrapur', 20.23, 79.0),
  buldhana: M('Buldhana', 'Buldhana', 20.53, 76.18),
  khamgaon: M('Khamgaon', 'Buldhana', 20.7, 76.57),
  malkapur: M('Malkapur', 'Buldhana', 20.88, 76.2),
  chikhli: M('Chikhli', 'Buldhana', 20.35, 76.25),
  mehkar: M('Mehkar', 'Buldhana', 20.15, 76.57),
  nandura: M('Nandura', 'Buldhana', 20.83, 76.46),
  washim: M('Washim', 'Washim', 20.11, 77.13),
  ansing: M('Ansing', 'Washim', 20.08, 77.27),
  karanja: M('Karanja', 'Washim', 20.48, 77.49),
  risod: M('Risod', 'Washim', 19.97, 76.78),
}

/** feed spellings → MARKETS ids */
const MARKET_ALIAS: Record<string, string> = {
  amrawati: 'amravati',
  dhamngaonrailway: 'dhamangaonrailway',
  anajngaon: 'anjangaon',
  umared: 'umred',
  mangalwedhe: 'mangalwedha',
  jalana: 'jalna',
  bhusaval: 'bhusawal',
  vai: 'wai',
  chattrapatisambhajinagar: 'chhatrapatisambhajinagar',
  aurangabad: 'chhatrapatisambhajinagar',
  ahmednagar: 'ahilyanagar',
  osmanabad: 'dharashiv',
  pimpalgaon: 'pimpalgaonbaswant',
  navimumbai: 'vashi',
}

/** district centres, keyed like MARKETS (feed + common spellings) */
const DISTRICT_AT: Record<string, [number, number]> = {
  ahilyanagar: [19.09, 74.74], ahmednagar: [19.09, 74.74], akola: [20.7, 77.0], amarawati: [20.93, 77.75], amravati: [20.93, 77.75],
  beed: [18.99, 75.76], bhandara: [21.17, 79.65], buldhana: [20.53, 76.18], chandrapur: [19.96, 79.3],
  chattrapatisambhajinagar: [19.88, 75.34], chhatrapatisambhajinagar: [19.88, 75.34], aurangabad: [19.88, 75.34],
  dharashiv: [18.18, 76.04], osmanabad: [18.18, 76.04], dhule: [20.9, 74.77], gadchiroli: [20.18, 80.0], gondia: [21.46, 80.2],
  hingoli: [19.72, 77.15], jalgaon: [21.0, 75.56], jalna: [19.84, 75.89], kolhapur: [16.7, 74.24], latur: [18.4, 76.57],
  mumbai: [19.08, 72.88], mumbaisuburban: [19.12, 72.85], nagpur: [21.15, 79.09], nanded: [19.15, 77.31], nandurbar: [21.37, 74.24],
  nashik: [20.0, 73.79], palghar: [19.7, 72.77], parbhani: [19.27, 76.77], pune: [18.52, 73.86], raigad: [18.52, 73.18],
  ratnagiri: [16.99, 73.3], sangli: [16.85, 74.58], satara: [17.69, 74.0], sindhudurg: [16.12, 73.69], solapur: [17.66, 75.91],
  thane: [19.22, 72.98], wardha: [20.74, 78.6], washim: [20.11, 77.13], yavatmal: [20.39, 78.12],
}
const MAHARASHTRA_CENTRE: [number, number] = [19.66, 75.3]

const PRETTY_DISTRICT: Record<string, string> = {
  'Chattrapati Sambhajinagar': 'Chhatrapati Sambhajinagar',
  Amarawati: 'Amravati',
}

const idOf = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
function findPlace(s: string | undefined): [string, Place] | null {
  if (!s) return null
  const id = idOf(s)
  const k = MARKET_ALIAS[id] ?? id
  const p = MARKETS[k]
  return p ? [k, p] : null
}

/** where a feed market is and what to call it */
function locate(raw: string, district: string): { id: string | null; name: string; at: [number, number] } {
  const s = raw.replace(/^APMC\s+/i, '').replace(/\s+/g, ' ').trim()
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(s)
  const outer = (m ? m[1]! : s).trim()
  const inner = m?.[2]?.trim()
  const firstWord = outer.split(/[\s-]/)[0]
  const sub = findPlace(inner)
  const main = findPlace(outer) ?? findPlace(firstWord)
  const name = inner ? `${main?.[1].name ?? outer} (${inner})` : (main?.[1].name ?? outer)
  const at = sub?.[1].at ?? main?.[1].at ?? DISTRICT_AT[idOf(district)] ?? MAHARASHTRA_CENTRE
  // only the main yard counts as "the" market (Lasalgaon, not a sub-yard)
  return { id: inner ? null : (main?.[0] ?? null), name, at }
}

/** a market's name in the farmer's language when we know it */
export function marketName(name: string, lang: Lang): string {
  if (lang === 'en') return name
  const p = findPlace(name)?.[1]
  return (p && p[lang]) || name
}

const PLACE_NAME: Record<string, T3> = {
  niphad: { en: 'Niphad', hi: 'निफाड', mr: 'निफाड' },
  nashik: { en: 'Nashik', hi: 'नासिक', mr: 'नाशिक' },
  pune: { en: 'Pune', hi: 'पुणे', mr: 'पुणे' },
  lasalgaon: { en: 'Lasalgaon', hi: 'लासलगांव', mr: 'लासलगाव' },
  latur: { en: 'Latur', hi: 'लातूर', mr: 'लातूर' },
  ahilyanagar: { en: 'Ahilyanagar', hi: 'अहिल्यानगर', mr: 'अहिल्यानगर' },
  solapur: { en: 'Solapur', hi: 'सोलापुर', mr: 'सोलापूर' },
}
const placeWord = (s: string, lang: Lang) => (PLACE_NAME[idOf(s)] ? L(PLACE_NAME[idOf(s)]!, lang) : s)

/** "Niphad, Nashik" from the profile, in the farmer's script where we know it */
export function placeName(village: string | undefined, district: string | undefined, lang: Lang): string {
  return [village, district]
    .filter((x): x is string => !!x && !!x.trim())
    .map((x) => placeWord(x.trim(), lang))
    .join(', ')
}

// ---- Weather -------------------------------------------------------------

/** seeded days from today — the offline stand-in for the live forecast */
export function weatherDays(n = 7): WeatherDay[] {
  return seededForecast(n)
}

export function weather(lang: Lang, location: string, live?: LiveWeather): Weather {
  const daily = live?.daily ?? seededForecast(7)
  return {
    location: location || L({ en: 'Niphad, Nashik', hi: 'निफाड, नासिक', mr: 'निफाड, नाशिक' }, lang),
    current: live?.current ?? SEEDED_CURRENT,
    daily,
    advisories: advisories(daily, lang),
  }
}

// ---- Mandi ---------------------------------------------------------------

type Seed = { base: number; slope: number; main: string; markets: [string, number][] }
const COMMODITY: Record<string, Seed> = {
  // offline stand-ins, near recent Maharashtra levels — [market id, offset vs base]
  onion: { base: 3950, slope: 8, main: 'lasalgaon', markets: [['lasalgaon', 0], ['pimpalgaonbaswant', 40], ['nashik', -90], ['yeola', -150], ['pune', -500], ['vashi', -300]] },
  soybean: { base: 6850, slope: -4, main: 'latur', markets: [['lasalgaon', 0], ['nashik', -30], ['malegaon', -60], ['sinnar', -45], ['latur', 140]] },
  tomato: { base: 1300, slope: 25, main: 'pimpalgaonbaswant', markets: [['pimpalgaonbaswant', 0], ['nashik', 60], ['sinnar', -40], ['pune', 240], ['vashi', 360]] },
  grapes: { base: 6000, slope: -9, main: 'pimpalgaonbaswant', markets: [['pimpalgaonbaswant', 0], ['nashik', 120], ['dindori', -80], ['lasalgaon', -150], ['vashi', 540]] },
  wheat: { base: 2900, slope: 2, main: 'nashik', markets: [['nashik', 0], ['malegaon', -60], ['ahilyanagar', -120], ['pune', 300], ['mumbai', 900]] },
  gram: { base: 6900, slope: 5, main: 'latur', markets: [['nashik', 0], ['ahilyanagar', -80], ['latur', 250], ['akola', 150], ['mumbai', 1500]] },
  cotton: { base: 7600, slope: 4, main: 'akola', markets: [['malegaon', 0], ['jalgaon', 120], ['akola', 200], ['yavatmal', 250]] },
  maize: { base: 2200, slope: 1, main: 'malegaon', markets: [['malegaon', 0], ['nashik', 30], ['yeola', -40], ['pune', 150]] },
  pomegranate: { base: 9000, slope: -12, main: 'nashik', markets: [['nashik', 0], ['satana', -300], ['solapur', 400], ['pune', 700]] },
}

export const COMMODITIES = Object.keys(COMMODITY)

const seedOf = (commodity: string): Seed => COMMODITY[commodity] ?? COMMODITY.onion!

/** 30 seeded days ending `end`; each day's wobble depends only on its date */
function seededCurve(commodity: string, end: string, base: number, slope: number): PricePoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const daysAgo = 29 - i
    const date = addDaysIso(end, -daysAgo)
    const noise = (seeded(hash(commodity + date))() - 0.5) * base * 0.06
    return { date, modalPrice: Math.round(base - slope * daysAgo + noise) }
  })
}

/**
 * 30-day trend for the trend market. Real prices first: the data.gov.in
 * history feed plus the prices this device has seen live. Days without
 * trading (Sundays, holidays) carry the last real price forward. Days before
 * the first real price come from the seeded curve, scaled to meet it.
 */
function liveTrend(commodity: string, market: string, end: string, livePrice: number, remote: Record<string, number> = {}): PricePoint[] {
  recordPrice(commodity, market, end, livePrice)
  const real: Record<string, number> = { ...remote, ...readPriceHistory(commodity, market), [end]: livePrice }
  const s = seedOf(commodity)
  const curve = seededCurve(commodity, end, s.base, s.slope)
  const firstReal = curve.findIndex((p) => real[p.date] !== undefined)
  const anchor = curve[firstReal]!
  const scale = real[anchor.date]! / (anchor.modalPrice || real[anchor.date]!)
  let last = 0
  return curve.map((p, i) => {
    if (real[p.date] !== undefined) last = real[p.date]!
    return { date: p.date, modalPrice: i < firstReal ? Math.round(p.modalPrice * scale) : last }
  })
}

function change7d(trend: PricePoint[]): number {
  const last = trend[trend.length - 1]?.modalPrice ?? 0
  const weekAgo = trend[trend.length - 8]?.modalPrice ?? last
  return weekAgo ? Math.round(((last - weekAgo) / weekAgo) * 1000) / 10 : 0
}

const MAX_MARKETS = 12

function seededMandi(commodity: string, lat: number, lon: number): MandiPrices {
  const c = seedOf(commodity)
  const today = todayIso()
  const trend = seededCurve(commodity, today, c.base, c.slope)
  const markets: MarketPrice[] = c.markets.map(([id, off]) => {
    const m = MARKETS[id]!
    const modal = c.base + off
    return {
      market: m.name,
      district: m.district,
      minPrice: Math.round(modal * 0.78),
      maxPrice: Math.round(modal * 1.14),
      modalPrice: modal,
      distanceKm: Math.round(haversineKm([lat, lon], m.at)),
      arrivalDate: today,
    }
  })
  markets.sort((a, b) => b.modalPrice - a.modalPrice)
  // the chart's last point is the main market's price shown in the list
  const mainName = MARKETS[c.main]?.name
  const main = markets.find((m) => m.market === mainName) ?? markets[0]!
  trend[trend.length - 1] = { date: today, modalPrice: main.modalPrice }
  return { commodity, unit: 'quintal', asOf: today, markets, trend, trendMarket: main.market, changePct7d: change7d(trend) }
}

type Row = MarketPrice & { id: string | null; rec: LiveMandiRecord }

/** one row per market, nearest first, plus the market the trend follows */
function liveRows(commodity: string, lat: number, lon: number, live: LiveMandi): { rows: Row[]; asOf: string; trendRow: Row } {
  const byMarket = new Map<string, Row>()
  for (const r of live.records) {
    const loc = locate(r.market, r.district)
    const row: Row = {
      market: loc.name,
      district: PRETTY_DISTRICT[r.district] ?? r.district,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
      modalPrice: r.modalPrice,
      distanceKm: Math.round(haversineKm([lat, lon], loc.at)),
      arrivalDate: r.arrivalDate,
      id: loc.id,
      rec: r,
    }
    const prev = byMarket.get(row.market)
    // one row per market: the latest day, and of its varieties the best-paid
    if (!prev || row.arrivalDate > prev.arrivalDate || (row.arrivalDate === prev.arrivalDate && row.modalPrice > prev.modalPrice)) {
      byMarket.set(row.market, row)
    }
  }
  const rows = [...byMarket.values()].sort((a, b) => a.distanceKm - b.distanceKm)
  const asOf = rows.reduce((d, r) => (r.arrivalDate > d ? r.arrivalDate : d), rows[0]!.arrivalDate)
  const mainId = seedOf(commodity).main
  return { rows, asOf, trendRow: rows.find((r) => r.id === mainId && r.arrivalDate === asOf) ?? representative(rows, asOf) }
}

/**
 * Without the main market, follow a typical nearby one: of the 6 nearest main
 * yards that traded on the latest day, the one closest to their median price
 * (a thin sub-yard's odd lot would make a jumpy trend).
 */
function representative(rows: Row[], asOf: string): Row {
  const today = rows.filter((r) => r.arrivalDate === asOf)
  const yards = today.filter((r) => r.id !== null)
  const pool = (yards.length ? yards : today.length ? today : rows).slice(0, 6)
  const sorted = [...pool].sort((a, b) => a.modalPrice - b.modalPrice)
  const median = sorted[Math.floor(sorted.length / 2)]!.modalPrice
  return pool.reduce((best, r) => (Math.abs(r.modalPrice - median) < Math.abs(best.modalPrice - median) ? r : best), pool[0]!)
}

/** the live record the 30-day trend follows (to fetch its real history), or null */
export function trendRecord(commodity: string, lat: number, lon: number, live?: LiveMandi | null): LiveMandiRecord | null {
  return live?.records.length ? liveRows(commodity, lat, lon, live).trendRow.rec : null
}

/**
 * MandiPrices from today's live feed when there is one, else the seeded
 * stand-in. `history` is the trend market's real past prices (date → modal).
 */
export function mandiPrices(commodity: string, lat: number, lon: number, live?: LiveMandi | null, history?: Record<string, number> | null): MandiPrices {
  if (!live?.records.length) return seededMandi(commodity, lat, lon)
  const { rows, asOf, trendRow } = liveRows(commodity, lat, lon, live)
  const shown = rows.slice(0, MAX_MARKETS)
  if (!shown.includes(trendRow)) shown.push(trendRow)
  const trend = liveTrend(commodity, trendRow.market, trendRow.arrivalDate, trendRow.modalPrice, history ?? {})
  const markets: MarketPrice[] = shown.map(({ id: _id, rec: _rec, ...m }) => m).sort((a, b) => b.modalPrice - a.modalPrice)
  return { commodity, unit: 'quintal', asOf, markets, trend, trendMarket: trendRow.market, changePct7d: change7d(trend) }
}

/** the price a farmer would quote: main market if it reported, else the nearest */
export function headlinePrice(p: MandiPrices): MarketPrice | undefined {
  return p.markets.find((m) => m.market === p.trendMarket) ?? [...p.markets].sort((a, b) => a.distanceKm - b.distanceKm)[0]
}

const TRANSPORT_PER_KM_PER_QTL = 2.5
/** WAIT when prices climb faster than this share of the price per day */
const WAIT_SLOPE_PER_DAY = 0.008

/** least-squares slope of the last 8 points, ₹/quintal per day */
function slopePerDay(trend: PricePoint[]): number {
  const pts = trend.slice(-8)
  const n = pts.length
  if (n < 2) return 0
  const mx = (n - 1) / 2
  const my = pts.reduce((s, p) => s + p.modalPrice, 0) / n
  let num = 0
  let den = 0
  pts.forEach((p, i) => {
    num += (i - mx) * (p.modalPrice - my)
    den += (i - mx) ** 2
  })
  return den ? num / den : 0
}

/** oblique form for "on onion" / "कांद्यावर" / "कांद्याचा" */
const CROP_NAME: Record<string, T3> = {
  onion: { en: 'onion', hi: 'प्याज़', mr: 'कांद्या' },
  soybean: { en: 'soybean', hi: 'सोयाबीन', mr: 'सोयाबीन' },
  tomato: { en: 'tomato', hi: 'टमाटर', mr: 'टोमॅटो' },
  grapes: { en: 'grapes', hi: 'अंगूर', mr: 'द्राक्षा' },
  wheat: { en: 'wheat', hi: 'गेहूँ', mr: 'गव्हा' },
  gram: { en: 'gram', hi: 'चना', mr: 'हरभऱ्या' },
  cotton: { en: 'cotton', hi: 'कपास', mr: 'कापसा' },
  maize: { en: 'maize', hi: 'मक्का', mr: 'मक्या' },
  pomegranate: { en: 'pomegranate', hi: 'अनार', mr: 'डाळिंबा' },
  sugarcane: { en: 'sugarcane', hi: 'गन्ना', mr: 'उसा' },
}
/** plain form: "Onion ₹…" / "कांदा ₹…" */
const CROP_NOM: Record<string, T3> = {
  onion: { en: 'Onion', hi: 'प्याज़', mr: 'कांदा' },
  soybean: { en: 'Soybean', hi: 'सोयाबीन', mr: 'सोयाबीन' },
  tomato: { en: 'Tomato', hi: 'टमाटर', mr: 'टोमॅटो' },
  grapes: { en: 'Grapes', hi: 'अंगूर', mr: 'द्राक्ष' },
  wheat: { en: 'Wheat', hi: 'गेहूँ', mr: 'गहू' },
  gram: { en: 'Gram', hi: 'चना', mr: 'हरभरा' },
  cotton: { en: 'Cotton', hi: 'कपास', mr: 'कापूस' },
  maize: { en: 'Maize', hi: 'मक्का', mr: 'मका' },
  pomegranate: { en: 'Pomegranate', hi: 'अनार', mr: 'डाळिंब' },
  sugarcane: { en: 'Sugarcane', hi: 'गन्ना', mr: 'ऊस' },
}
const cropObl = (id: string): T3 => CROP_NAME[id] ?? { en: id, hi: id, mr: id }
const cropNom = (id: string): T3 => CROP_NOM[id] ?? { en: cap(id), hi: id, mr: id }

export function sellAdvice(req: SellAdviceRequest, prices: MandiPrices = mandiPrices(req.commodity, req.lat, req.lon)): SellAdvice {
  const qty = req.quantityQuintals
  const options = prices.markets
    .map((m) => {
      const transportCost = Math.round(m.distanceKm * TRANSPORT_PER_KM_PER_QTL * qty)
      return {
        market: m.market,
        modalPrice: m.modalPrice,
        distanceKm: m.distanceKm,
        transportCost,
        netEarning: Math.round(m.modalPrice * qty - transportCost),
      }
    })
    .sort((a, b) => b.netEarning - a.netEarning)
  const best = options[0]!
  const topPrice = [...options].sort((a, b) => b.modalPrice - a.modalPrice)[0]!
  const lastPrice = prices.trend[prices.trend.length - 1]?.modalPrice ?? best.modalPrice
  const slope = Math.round(slopePerDay(prices.trend))
  const wait = lastPrice > 0 && slope / lastPrice >= WAIT_SLOPE_PER_DAY
  const lang = req.lang
  const crop = cropObl(req.commodity)
  const ch = prices.changePct7d
  const pct = Math.abs(ch)
  const bestAt = { en: best.market, hi: marketName(best.market, 'hi'), mr: marketName(best.market, 'mr') }
  const topAt = { en: topPrice.market, hi: marketName(topPrice.market, 'hi'), mr: marketName(topPrice.market, 'mr') }
  const gain = rupees(slope * 6 * qty)

  let reasoning: string
  if (wait) {
    reasoning = L(
      {
        en: `Prices for ${crop.en} have risen about ₹${slope} per quintal every day this week. Waiting 5–7 days could add roughly ₹${gain}. If your crop can't wait, ${bestAt.en} gives the best net today.`,
        hi: `इस हफ्ते ${crop.hi} का भाव रोज़ लगभग ₹${slope} प्रति क्विंटल बढ़ा है। 5–7 दिन रुकने से लगभग ₹${gain} ज़्यादा मिल सकते हैं। अगर माल रुक नहीं सकता, तो आज ${bestAt.hi} में सबसे अच्छा शुद्ध दाम है।`,
        mr: `या आठवड्यात ${crop.mr}चा भाव रोज सुमारे ₹${slope} प्रति क्विंटल वाढला आहे. 5–7 दिवस थांबल्यास सुमारे ₹${gain} जास्त मिळू शकतात. माल थांबू शकत नसेल तर आज ${bestAt.mr} मध्ये सर्वात चांगला निव्वळ दर आहे.`,
      },
      lang,
    )
  } else {
    const first = L({ en: `${bestAt.en} gives you the most after transport.`, hi: `ढुलाई के बाद ${bestAt.hi} में सबसे ज़्यादा पैसा मिलेगा।`, mr: `वाहतूक खर्चानंतर ${bestAt.mr} मध्ये सर्वात जास्त पैसे मिळतील.` }, lang)
    const far =
      topPrice.market !== best.market
        ? ' ' +
          L(
            {
              en: `${topAt.en} pays more per quintal (₹${rupees(topPrice.modalPrice)}), but the truck cost eats the difference.`,
              hi: `${topAt.hi} में भाव ज़्यादा है (₹${rupees(topPrice.modalPrice)}), पर ट्रक का खर्च वह फ़र्क खा जाता है।`,
              mr: `${topAt.mr} येथे भाव जास्त आहे (₹${rupees(topPrice.modalPrice)}), पण ट्रकचा खर्च तो फरक खाऊन टाकतो.`,
            },
            lang,
          )
        : ''
    const trend =
      ch > 1.5
        ? L({ en: `Prices rose ${pct}% this week — selling part now locks in a good rate.`, hi: `इस हफ्ते भाव ${pct}% बढ़ा है — अभी कुछ माल बेचकर अच्छा दाम पक्का करें।`, mr: `या आठवड्यात भाव ${pct}% वाढला आहे — आता काही माल विकून चांगला दर पक्का करा.` }, lang)
        : ch < -1.5
          ? L({ en: `Prices fell ${pct}% this week and are not climbing back yet, so selling now avoids a further drop.`, hi: `इस हफ्ते भाव ${pct}% गिरा है और अभी संभल नहीं रहा, इसलिए अभी बेचना और नुकसान से बचाता है।`, mr: `या आठवड्यात भाव ${pct}% घसरला आहे आणि अजून सावरत नाही, म्हणून आता विकल्यास आणखी तोटा टळेल.` }, lang)
          : L({ en: 'Prices are steady this week, so selling now is safe.', hi: 'इस हफ्ते भाव स्थिर है, अभी बेचना सुरक्षित है।', mr: 'या आठवड्यात भाव स्थिर आहे, आता विकणे सुरक्षित आहे.' }, lang)
    reasoning = `${first}${far} ${trend}`
  }
  return {
    recommendation: wait ? 'WAIT' : 'SELL_NOW',
    bestMarket: best.market,
    netEarning: best.netEarning,
    options,
    trendSlope: slope,
    reasoning,
  }
}

// ---- Brief ---------------------------------------------------------------

export interface BriefContext {
  name: string
  /** the farmer's crops, first = main */
  crops: string[]
  /** 7 days from today (live, cached or seeded) */
  weather: LiveWeather
  /** MandiPrices by commodity id, for the crops that have them */
  prices: Record<string, MandiPrices>
  toolCalls: ToolCallLog[]
}

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

function weatherActions(days: WeatherDay[], cropId: string, lang: Lang, today: string): ActionItem[] {
  const crop = cropObl(cropId)
  const out: ActionItem[] = []
  const w = (date: string) => ({ en: dayWord(date, 'en', today), hi: dayWord(date, 'hi', today), mr: dayWord(date, 'mr', today) })

  const rainy = days.slice(0, 3).find((d) => d.rainProb > 60)
  if (rainy) {
    const rw = w(rainy.date)
    const dry = days.find((d) => d.date > rainy.date && d.rainProb <= 40)
    const dw = dry ? w(dry.date) : null
    const todayOk = rainy.date !== today && (days[0]?.rainProb ?? 100) <= 40
    const detail: T3 =
      todayOk && dw
        ? { en: `Spray today before 4 pm, or wait until ${dw.en} when leaves are dry.`, hi: `आज शाम 4 बजे से पहले छिड़कें, या ${dw.hi} तक रुकें जब पत्ते सूखे हों।`, mr: `आज दुपारी 4 पूर्वी फवारणी करा, किंवा पाने कोरडी होतील तेव्हा ${dw.mr}पर्यंत थांबा.` }
        : todayOk
          ? { en: 'Spray today before 4 pm so it dries before the rain.', hi: 'आज शाम 4 बजे से पहले छिड़कें ताकि बारिश से पहले दवा सूख जाए।', mr: 'आज दुपारी 4 पूर्वी फवारणी करा म्हणजे पावसाआधी औषध सुकेल.' }
          : dw
            ? { en: `Wait until ${dw.en} when leaves are dry.`, hi: `${dw.hi} तक रुकें जब पत्ते सूखे हों।`, mr: `पाने कोरडी होतील तेव्हा ${dw.mr}पर्यंत थांबा.` }
            : { en: 'Wait for two dry days in a row before spraying.', hi: 'छिड़काव से पहले लगातार दो सूखे दिनों का इंतज़ार करें।', mr: 'फवारणीपूर्वी सलग दोन कोरड्या दिवसांची वाट पहा.' }
    out.push({
      id: `spray-rain-${rainy.date}`,
      type: 'spray',
      priority: 'high',
      source: 'weather',
      route: '/weather',
      title: L(
        {
          en: `Don't spray ${crop.en} ${rw.en} — ${rainy.rainProb}% rain`,
          hi: `${rw.hi} ${crop.hi} पर छिड़काव न करें — ${rainy.rainProb}% बारिश`,
          mr: `${rw.mr} ${crop.mr}वर फवारणी करू नका — ${rainy.rainProb}% पाऊस`,
        },
        lang,
      ),
      detail: L(detail, lang),
    })
  }

  const windy = !rainy ? days.slice(0, 2).find((d) => d.windKmh > 20) : undefined
  if (windy) {
    const ww = w(windy.date)
    out.push({
      id: `spray-wind-${windy.date}`,
      type: 'spray',
      priority: 'medium',
      source: 'weather',
      route: '/weather',
      title: L(
        {
          en: `Strong wind ${ww.en} (${windy.windKmh} km/h) — spray only in the calm early morning`,
          hi: `${ww.hi} तेज़ हवा (${windy.windKmh} किमी/घंटा) — सिर्फ़ सुबह शांत हवा में छिड़कें`,
          mr: `${ww.mr} जोराचा वारा (${windy.windKmh} किमी/तास) — फक्त सकाळी शांत वेळी फवारणी करा`,
        },
        lang,
      ),
      detail: L(
        { en: 'Spray drifts in wind and wastes the dose. Most days are calmest before 9 am.', hi: 'हवा में दवा उड़ जाती है और बेकार जाती है। सुबह 9 बजे से पहले हवा सबसे शांत रहती है।', mr: 'वाऱ्यात औषध उडून वाया जाते. सकाळी 9 पूर्वी वारा सर्वात शांत असतो.' },
        lang,
      ),
    })
  }

  const hot = days.slice(0, 3).find((d) => d.maxC > 38)
  if (hot) {
    const hw = w(hot.date)
    out.push({
      id: `irrigate-heat-${hot.date}`,
      type: 'irrigate',
      priority: 'high',
      source: 'weather',
      route: '/weather',
      title: L(
        {
          en: `${cap(hw.en)} ${hot.maxC}°C — irrigate ${crop.en} in the evening`,
          hi: `${hw.hi} ${hot.maxC}°C — ${crop.hi} में शाम को सिंचाई करें`,
          mr: `${hw.mr} ${hot.maxC}°C — ${crop.mr}ला संध्याकाळी पाणी द्या`,
        },
        lang,
      ),
      detail: L({ en: 'Evening water is not lost to the afternoon sun.', hi: 'शाम का पानी दोपहर की धूप में नहीं उड़ता।', mr: 'संध्याकाळचे पाणी दुपारच्या उन्हात उडून जात नाही.' }, lang),
    })
  }

  // nothing to warn about: say what today is good for instead
  const d0 = days[0]
  if (!out.length && d0) {
    const calm = d0.rainProb <= 40
    out.push({
      id: `spray-calm-${d0.date}`,
      type: 'spray',
      priority: calm ? 'low' : 'medium',
      source: 'weather',
      route: calm ? '/label' : '/weather',
      title: calm
        ? L(
            {
              en: `Good day to spray ${crop.en} — ${d0.rainProb}% rain, wind ${d0.windKmh} km/h`,
              hi: `आज ${crop.hi} पर छिड़काव के लिए अच्छा दिन — ${d0.rainProb}% बारिश, हवा ${d0.windKmh} किमी/घंटा`,
              mr: `आज ${crop.mr}वर फवारणीसाठी चांगला दिवस — ${d0.rainProb}% पाऊस, वारा ${d0.windKmh} किमी/तास`,
            },
            lang,
          )
        : L(
            {
              en: `Spray ${crop.en} only if the sky stays clear — ${d0.rainProb}% rain today`,
              hi: `आसमान साफ़ रहे तभी ${crop.hi} पर छिड़काव करें — आज ${d0.rainProb}% बारिश`,
              mr: `आकाश निरभ्र राहिले तरच ${crop.mr}वर फवारणी करा — आज ${d0.rainProb}% पाऊस`,
            },
            lang,
          ),
      detail: calm
        ? L(
            {
              en: 'No heavy rain or strong wind is forecast for the next 3 days. Read the dose from the label first; spray before 11 am or after 4 pm.',
              hi: 'अगले 3 दिन तेज़ बारिश या तेज़ हवा का अनुमान नहीं है। पहले लेबल से मात्रा पढ़ें; सुबह 11 से पहले या शाम 4 के बाद छिड़कें।',
              mr: 'पुढील 3 दिवस जोराचा पाऊस किंवा वारा अपेक्षित नाही. आधी लेबलवरून प्रमाण वाचा; सकाळी 11 पूर्वी किंवा दुपारी 4 नंतर फवारा.',
            },
            lang,
          )
        : L(
            {
              en: 'Check again before you mix the tank — rain within 4 hours washes the spray off.',
              hi: 'टंकी घोलने से पहले फिर देखें — 4 घंटे में बारिश हुई तो दवा धुल जाएगी।',
              mr: 'टाकी भरण्यापूर्वी पुन्हा पहा — 4 तासांत पाऊस आला तर औषध धुऊन जाईल.',
            },
            lang,
          ),
    })
  }
  return out
}

function sellAction(cropId: string, p: MandiPrices, lang: Lang): ActionItem | null {
  const m = headlinePrice(p)
  if (!m) return null
  const crop = cropNom(cropId)
  const price = rupees(m.modalPrice)
  const at = { en: m.market, hi: marketName(m.market, 'hi'), mr: marketName(m.market, 'mr') }
  const ch = p.changePct7d
  const pct = Math.abs(ch)
  const title: T3 =
    ch > 1.5
      ? { en: `${crop.en} ₹${price} at ${at.en} — up ${pct}% this week, good time to sell part`, hi: `${at.hi} में ${crop.hi} ₹${price} — इस हफ्ते ${pct}% बढ़ा, कुछ माल बेचने का अच्छा समय`, mr: `${at.mr} येथे ${crop.mr} ₹${price} — या आठवड्यात ${pct}% वाढ, काही माल विकण्याची चांगली वेळ` }
      : ch < -1.5
        ? { en: `${crop.en} ₹${price} at ${at.en} — down ${pct}% this week`, hi: `${at.hi} में ${crop.hi} ₹${price} — इस हफ्ते ${pct}% घटा`, mr: `${at.mr} येथे ${crop.mr} ₹${price} — या आठवड्यात ${pct}% घट` }
        : { en: `${crop.en} ₹${price} at ${at.en} — steady this week`, hi: `${at.hi} में ${crop.hi} ₹${price} — इस हफ्ते भाव स्थिर`, mr: `${at.mr} येथे ${crop.mr} ₹${price} — या आठवड्यात भाव स्थिर` }
  const detail: T3 =
    ch < -1.5
      ? { en: 'If you can store it safely, hold for now. Sell Smart shows which market pays the most after transport.', hi: 'अगर माल सुरक्षित रख सकते हैं तो अभी रुकें। ढुलाई के बाद कौन-सा बाज़ार सबसे ज़्यादा देता है, Sell Smart में देखें।', mr: 'माल सुरक्षित साठवता येत असेल तर सध्या थांबा. वाहतुकीनंतर कोणता बाजार सर्वात जास्त देतो ते Sell Smart मध्ये पहा.' }
      : { en: 'Check Sell Smart to compare markets after transport.', hi: 'ढुलाई के बाद बाज़ारों की तुलना Sell Smart में देखें।', mr: 'वाहतुकीनंतर बाजारांची तुलना Sell Smart मध्ये पहा.' }
  return { id: `sell-${cropId}`, type: 'sell', priority: 'medium', source: 'mandi', route: '/mandi', title: L(title, lang), detail: L(detail, lang) }
}

function calendarAction(crops: string[], days: WeatherDay[], lang: Lang, today: string): ActionItem | null {
  // grapes after rain: new shoots catch downy mildew
  const wet = days.slice(0, 4).find((d) => d.rainProb > 50 || d.rainMm >= 2)
  if (crops.includes('grapes') && wet) {
    const check = addDaysIso(wet.date, 1)
    const rel = daysBetween(today, check) <= 1
    const d = { en: dayWord(check, 'en', today), hi: dayWord(check, 'hi', today), mr: dayWord(check, 'mr', today) }
    return {
      id: 'protect-grapes',
      type: 'protect',
      priority: 'low',
      source: 'calendar',
      route: '/calendar',
      title: L({ en: 'Grapes: watch for downy mildew after the rain', hi: 'अंगूर: बारिश के बाद डाउनी मिल्ड्यू पर नज़र रखें', mr: 'द्राक्ष: पावसानंतर डाऊनी मिल्ड्यूकडे लक्ष ठेवा' }, lang),
      detail: L(
        {
          en: `New shoots after pruning are tender. Check leaf undersides ${rel ? d.en : 'on ' + d.en}.`,
          hi: `छँटाई के बाद नई कोंपलें नाज़ुक हैं। ${rel ? d.hi : d.hi + ' को'} पत्तों के नीचे देखें।`,
          mr: `छाटणीनंतरचे नवीन फुटवे कोवळे आहेत. ${d.mr} पानांच्या खालची बाजू तपासा.`,
        },
        lang,
      ),
    }
  }
  // otherwise: a sowing window that is open now or opens within 3 weeks
  const soon = upcomingSowing(today).filter((s) => s.to >= today && daysBetween(today, s.from) <= 21)
  const pick = soon.find((s) => crops.includes(s.crop)) ?? soon[0]
  if (!pick) return null
  const name = L(pick.name, lang)
  const open = pick.from <= today
  const to = shortDate(pick.to, lang)
  const from = shortDate(pick.from, lang)
  return {
    id: `sow-${pick.crop}`,
    type: 'sow',
    priority: 'low',
    source: 'calendar',
    route: '/calendar',
    title: open
      ? L({ en: `${name} sowing is open till ${to}`, hi: `${name} की बुवाई ${to} तक`, mr: `${name} पेरणी ${to} पर्यंत सुरू` }, lang)
      : L({ en: `${name} sowing opens ${from} — get seed and nursery ready`, hi: `${name} की बुवाई ${from} से — बीज और नर्सरी तैयार रखें`, mr: `${name} पेरणी ${from} पासून — बियाणे व रोपवाटिका तयार ठेवा` }, lang),
    detail: L({ en: 'See the week-by-week plan in the crop calendar.', hi: 'फसल कैलेंडर में हफ्ते-दर-हफ्ते योजना देखें।', mr: 'पीक दिनदर्शिकेत आठवड्यानुसार नियोजन पहा.' }, lang),
  }
}

function partOfDay(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function brief(lang: Lang, ctx: BriefContext): Brief {
  const first = ctx.name.split(' ')[0] || ctx.name
  const today = todayIso()
  const days = ctx.weather.daily
  const crops = ctx.crops.length ? ctx.crops : ['onion']
  const mainCrop = crops[0]!
  const sellCrop = crops.find((c) => ctx.prices[c])

  const actions: ActionItem[] = [...weatherActions(days, mainCrop, lang, today)]
  const sell = sellCrop ? sellAction(sellCrop, ctx.prices[sellCrop]!, lang) : null
  if (sell) actions.push(sell)
  const cal = calendarAction(crops, days, lang, today)
  if (cal) actions.push(cal)
  actions.sort((a, b) => RANK[a.priority] - RANK[b.priority])

  const priceAlerts: PriceAlert[] = crops
    .filter((c) => ctx.prices[c])
    .slice(0, 3)
    .flatMap((c) => {
      const p = ctx.prices[c]!
      const m = headlinePrice(p)
      if (!m) return []
      return [{ commodity: c, market: m.market, modalPrice: m.modalPrice, changePct: p.changePct7d, direction: p.changePct7d > 0.5 ? 'up' : p.changePct7d < -0.5 ? 'down' : 'flat' } satisfies PriceAlert]
    })

  return {
    greeting: L({ en: `${partOfDay()}, ${first}`, hi: `नमस्ते ${first}जी`, mr: `नमस्कार ${first}राव` }, lang),
    date: today,
    weather: days.slice(0, 4),
    actions: actions.slice(0, 3),
    priceAlerts,
    toolCalls: ctx.toolCalls,
  }
}


// ---- AI ------------------------------------------------------------------

export function cropDoctor(lang: Lang, crop?: string): CropDiagnosis {
  if (crop === 'tomato') {
    return {
      diagnosis: L({ en: 'Early blight', hi: 'अगेती झुलसा (अर्ली ब्लाइट)', mr: 'लवकर करपा (अर्ली ब्लाइट)' }, lang),
      scientificName: 'Alternaria solani',
      confidence: 0.86,
      severity: 'medium',
      symptoms: LA(
        [
          { en: 'Brown spots with rings like a target on lower leaves', hi: 'निचली पत्तियों पर निशाने जैसे छल्लों वाले भूरे धब्बे', mr: 'खालच्या पानांवर नेमासारखी वर्तुळे असलेले तपकिरी ठिपके' },
          { en: 'Yellowing around the spots', hi: 'धब्बों के आसपास पीलापन', mr: 'ठिपक्यांभोवती पिवळेपणा' },
        ],
        lang,
      ),
      treatment: {
        organic: LA(
          [
            { en: 'Remove and burn infected lower leaves', hi: 'संक्रमित निचली पत्तियाँ तोड़कर जला दें', mr: 'रोगट खालची पाने तोडून जाळून टाका' },
            { en: 'Spray neem oil 5 ml per litre of water', hi: 'नीम तेल 5 मिली प्रति लीटर पानी में छिड़कें', mr: 'निंबोळी तेल 5 मिली प्रति लिटर पाण्यात फवारा' },
          ],
          lang,
        ),
        chemical: LA(
          [{ en: 'Mancozeb 75% WP — follow the dose printed on the label', hi: 'मैनकोज़ेब 75% WP — लेबल पर छपी मात्रा ही लें', mr: 'मॅन्कोझेब 75% WP — लेबलवर छापलेलेच प्रमाण वापरा' }],
          lang,
        ),
      },
      prevention: LA(
        [
          { en: 'Water at the base, not on the leaves', hi: 'पानी जड़ में दें, पत्तों पर नहीं', mr: 'पाणी मुळाशी द्या, पानांवर नाही' },
          { en: 'Rotate with a non-solanaceous crop next season', hi: 'अगले मौसम में दूसरी फसल लगाएँ', mr: 'पुढच्या हंगामात वेगळे पीक घ्या' },
        ],
        lang,
      ),
      escalate: false,
      model: MODEL,
    }
  }
  if (crop === 'grapes') {
    return {
      diagnosis: L({ en: 'Downy mildew', hi: 'डाउनी मिल्ड्यू (केवड़ा)', mr: 'डाऊनी मिल्ड्यू (केवडा)' }, lang),
      scientificName: 'Plasmopara viticola',
      confidence: 0.79,
      severity: 'high',
      symptoms: LA(
        [
          { en: 'Yellow oily patches on the upper leaf', hi: 'पत्ते के ऊपर पीले तैलीय धब्बे', mr: 'पानाच्या वरच्या बाजूला पिवळे तेलकट डाग' },
          { en: 'White downy growth underneath', hi: 'नीचे सफ़ेद रोएँदार परत', mr: 'खालच्या बाजूला पांढरी केसाळ वाढ' },
        ],
        lang,
      ),
      treatment: {
        organic: LA(
          [
            { en: 'Open the canopy — remove extra shoots for air flow', hi: 'छतरी खोलें — हवा के लिए अतिरिक्त कोंपलें हटाएँ', mr: 'वेलीचा घेर मोकळा करा — हवेसाठी जास्तीचे फुटवे काढा' },
            { en: 'Spray Bordeaux mixture 1%', hi: '1% बोर्डो मिश्रण छिड़कें', mr: '1% बोर्डो मिश्रण फवारा' },
          ],
          lang,
        ),
        chemical: LA(
          [{ en: 'Metalaxyl + Mancozeb — dose from the label only', hi: 'मेटालैक्सिल + मैनकोज़ेब — मात्रा केवल लेबल से', mr: 'मेटॅलॅक्झिल + मॅन्कोझेब — प्रमाण फक्त लेबलवरून' }],
          lang,
        ),
      },
      prevention: LA([{ en: 'Avoid spraying water on leaves in the evening', hi: 'शाम को पत्तों पर पानी न डालें', mr: 'संध्याकाळी पानांवर पाणी टाकू नका' }], lang),
      escalate: false,
      model: MODEL,
    }
  }
  return {
    diagnosis: L({ en: 'Purple blotch', hi: 'बैंगनी धब्बा (पर्पल ब्लॉच)', mr: 'जांभळा करपा (पर्पल ब्लॉच)' }, lang),
    scientificName: 'Alternaria porri',
    confidence: 0.88,
    severity: 'medium',
    symptoms: LA(
      [
        { en: 'Small white sunken spots that turn purple with a yellow edge', hi: 'छोटे सफ़ेद धँसे धब्बे जो पीली किनारी के साथ बैंगनी हो जाते हैं', mr: 'लहान पांढरे खोलगट ठिपके जे पिवळ्या कडेसह जांभळे होतात' },
        { en: 'Leaf tips dry and fall over', hi: 'पत्तों के सिरे सूखकर गिर जाते हैं', mr: 'पानांची टोके वाळून खाली पडतात' },
        { en: 'Spreads fast after rain or heavy dew', hi: 'बारिश या ओस के बाद तेज़ी से फैलता है', mr: 'पाऊस किंवा दवानंतर झपाट्याने पसरतो' },
      ],
      lang,
    ),
    treatment: {
      organic: LA(
        [
          { en: 'Pull out badly infected plants and destroy them', hi: 'ज़्यादा संक्रमित पौधे उखाड़कर नष्ट करें', mr: 'जास्त रोगट रोपे उपटून नष्ट करा' },
          { en: 'Spray Trichoderma or neem-based fungicide', hi: 'ट्राइकोडर्मा या नीम आधारित दवा छिड़कें', mr: 'ट्रायकोडर्मा किंवा निंबोळी आधारित औषध फवारा' },
        ],
        lang,
      ),
      chemical: LA(
        [
          { en: 'Mancozeb 75% WP — dose from the label (use Label Reader)', hi: 'मैनकोज़ेब 75% WP — मात्रा लेबल से (लेबल रीडर इस्तेमाल करें)', mr: 'मॅन्कोझेब 75% WP — प्रमाण लेबलवरून (लेबल वाचक वापरा)' },
          { en: 'Add a sticker so the spray stays on waxy onion leaves', hi: 'चिपकने वाला द्रव मिलाएँ ताकि दवा पत्तों पर टिके', mr: 'स्टिकर मिसळा म्हणजे औषध कांद्याच्या पानांवर टिकेल' },
        ],
        lang,
      ),
    },
    prevention: LA(
      [
        { en: 'Keep 15 cm between plants for air flow', hi: 'हवा के लिए पौधों में 15 सेमी दूरी रखें', mr: 'हवेसाठी रोपांमध्ये 15 सेमी अंतर ठेवा' },
        { en: "Don't over-irrigate; avoid water standing in the field", hi: 'ज़्यादा पानी न दें; खेत में पानी न रुकने दें', mr: 'जास्त पाणी देऊ नका; शेतात पाणी साचू देऊ नका' },
      ],
      lang,
    ),
    escalate: false,
    model: MODEL,
  }
}

export function labelReader(lang: Lang, tankSizeLitres: number, unreadable = false): LabelReading {
  const base = {
    productName: 'Mancozeb 75% WP',
    activeIngredient: 'Mancozeb 75% w/w',
    formulation: '75% WP',
    tankSizeLitres,
    model: MODEL,
    safety: LA(
      [
        { en: 'Wear gloves and a mask', hi: 'दस्ताने और मास्क पहनें', mr: 'हातमोजे आणि मास्क घाला' },
        { en: 'Spray with the wind behind you', hi: 'हवा की दिशा में पीठ करके छिड़कें', mr: 'वारा पाठीमागून येईल असे उभे राहून फवारा' },
        { en: "Don't eat, drink or smoke while spraying", hi: 'छिड़काव के समय खाना, पीना या धूम्रपान न करें', mr: 'फवारणी करताना खाऊ, पिऊ किंवा धूम्रपान करू नका' },
        { en: 'Wash hands and clothes after spraying', hi: 'छिड़काव के बाद हाथ और कपड़े धोएँ', mr: 'फवारणीनंतर हात आणि कपडे धुवा' },
      ],
      lang,
    ),
    warnings: LA(
      [
        { en: 'Harmful if swallowed — keep away from children', hi: 'निगलने पर हानिकारक — बच्चों से दूर रखें', mr: 'गिळल्यास घातक — मुलांपासून दूर ठेवा' },
        { en: 'Toxic to fish — do not wash the pump in a well or stream', hi: 'मछलियों के लिए ज़हरीला — पंप कुएँ या नाले में न धोएँ', mr: 'माशांसाठी विषारी — पंप विहिरीत किंवा ओढ्यात धुऊ नका' },
      ],
      lang,
    ),
  }
  if (unreadable) {
    return { ...base, dosePerTank: null, waitingPeriodDays: null, confidence: 0.41, escalate: true }
  }
  return {
    ...base,
    // label: 2.5 g per litre of water
    dosePerTank: { amount: Math.round(2.5 * tankSizeLitres * 10) / 10, unit: 'g' },
    waitingPeriodDays: 15,
    confidence: 0.93,
    escalate: false,
  }
}

export function explainDocument(lang: Lang): DocumentExplanation {
  const due = addDaysIso(todayIso(), 21)
  return {
    docType: L({ en: 'Kisan Credit Card renewal notice', hi: 'किसान क्रेडिट कार्ड नवीनीकरण सूचना', mr: 'किसान क्रेडिट कार्ड नूतनीकरण सूचना' }, lang),
    summary: L(
      {
        en: 'Your bank says your crop loan (KCC) limit is due for renewal. Pay the interest and visit the branch before the date below to keep the 4% interest rate.',
        hi: 'बैंक कह रहा है कि आपके फसल ऋण (KCC) की सीमा का नवीनीकरण होना है। नीचे की तारीख से पहले ब्याज भरें और शाखा जाएँ ताकि 4% ब्याज दर बनी रहे।',
        mr: 'बँक सांगत आहे की तुमच्या पीक कर्जाची (KCC) मर्यादा नूतनीकरणासाठी आली आहे. 4% व्याजदर कायम ठेवण्यासाठी खालील तारखेपूर्वी व्याज भरा आणि शाखेत जा.',
      },
      lang,
    ),
    keyPoints: LA(
      [
        { en: 'Loan limit: ₹1,60,000', hi: 'ऋण सीमा: ₹1,60,000', mr: 'कर्ज मर्यादा: ₹1,60,000' },
        { en: 'Interest due: ₹4,850', hi: 'बकाया ब्याज: ₹4,850', mr: 'थकीत व्याज: ₹4,850' },
        { en: 'Late renewal loses the interest subsidy', hi: 'देर से नवीनीकरण पर ब्याज छूट नहीं मिलेगी', mr: 'उशिरा नूतनीकरण केल्यास व्याज सवलत मिळणार नाही' },
      ],
      lang,
    ),
    deadlines: [{ label: L({ en: 'Renew KCC at branch', hi: 'शाखा में KCC नवीनीकरण', mr: 'शाखेत KCC नूतनीकरण' }, lang), date: due }],
    nextSteps: LA(
      [
        { en: 'Pay ₹4,850 interest', hi: '₹4,850 ब्याज भरें', mr: '₹4,850 व्याज भरा' },
        { en: 'Take the 7/12 extract and passbook to the branch', hi: '7/12 उतारा और पासबुक शाखा ले जाएँ', mr: '7/12 उतारा आणि पासबुक शाखेत न्या' },
        { en: 'Sign the renewal form', hi: 'नवीनीकरण फ़ॉर्म पर हस्ताक्षर करें', mr: 'नूतनीकरण अर्जावर सही करा' },
      ],
      lang,
    ),
    redactedFields: LA(
      [
        { en: 'Aadhaar number', hi: 'आधार नंबर', mr: 'आधार क्रमांक' },
        { en: 'Bank account number', hi: 'बैंक खाता नंबर', mr: 'बँक खाते क्रमांक' },
        { en: 'Mobile number', hi: 'मोबाइल नंबर', mr: 'मोबाईल क्रमांक' },
      ],
      lang,
    ),
    model: MODEL,
  }
}

export function voice(lang: Lang, context: VoiceContext, onion?: { market: string; modalPrice: number; changePct: number }): VoiceResponse {
  if (context.formFields?.length) {
    const slots: Record<string, string> = {}
    const sample: Record<string, string> = { name: 'Ramesh Patil', village: 'Niphad', district: 'Nashik', landAcres: '2.5', crop: 'onion', bankName: 'Nashik DCC Bank' }
    for (const f of context.formFields) if (sample[f]) slots[f] = sample[f]
    return {
      transcript: L({ en: 'My name is Ramesh Patil, from Niphad, I have two and a half acres', hi: 'मेरा नाम रमेश पाटिल है, निफाड से, ढाई एकड़ ज़मीन है', mr: 'माझं नाव रमेश पाटील, निफाडचा, अडीच एकर जमीन आहे' }, lang),
      reply: L({ en: 'I filled your name, village and land. Please check each one.', hi: 'मैंने नाम, गाँव और ज़मीन भर दी है। कृपया हर एक जाँच लें।', mr: 'मी नाव, गाव आणि जमीन भरली आहे. कृपया प्रत्येक तपासा.' }, lang),
      intent: 'fill_form',
      navigateTo: null,
      slots,
      escalate: false,
      model: MODEL,
    }
  }
  const q = onion ?? { market: 'Lasalgaon', modalPrice: 3950, changePct: 1.2 }
  const price = rupees(q.modalPrice)
  const dir = q.changePct > 0.5 ? 'up' : q.changePct < -0.5 ? 'down' : 'flat'
  const at = { en: q.market, hi: marketName(q.market, 'hi'), mr: marketName(q.market, 'mr') }
  return {
    transcript: L({ en: 'What is the onion price today?', hi: 'आज प्याज़ का भाव क्या है?', mr: 'आज कांद्याचा भाव काय आहे?' }, lang),
    reply: L(
      {
        en: `Onion is ₹${price} per quintal at ${at.en} today, ${{ up: 'up', down: 'down', flat: 'steady' }[dir]} this week. Opening the mandi page.`,
        hi: `आज ${at.hi} में प्याज़ ₹${price} प्रति क्विंटल है, इस हफ्ते ${{ up: 'बढ़ा है', down: 'घटा है', flat: 'स्थिर है' }[dir]}। मंडी पेज खोल रहा हूँ।`,
        mr: `आज ${at.mr} येथे कांदा ₹${price} प्रति क्विंटल आहे, या आठवड्यात ${{ up: 'वाढला आहे', down: 'घटला आहे', flat: 'स्थिर आहे' }[dir]}. बाजारभाव पान उघडत आहे.`,
      },
      lang,
    ),
    intent: 'navigate',
    navigateTo: '/mandi',
    slots: {},
    escalate: false,
    model: MODEL,
  }
}

// ---- Calendar ------------------------------------------------------------

type CropSeed = { crop: string; name: T3; suitability: CropRecommendation['suitability']; from: string; to: string; durationDays: number; why: T3; timeline: { title: T3; tasks: T3[] }[] }

const CROPS: Record<Season, CropSeed[]> = {
  rabi: [
    {
      crop: 'onion',
      name: { en: 'Rabi onion', hi: 'रबी प्याज़', mr: 'रब्बी कांदा' },
      suitability: 'high',
      from: '11-01',
      to: '12-15',
      durationDays: 120,
      why: { en: 'Black soil and drip suit onion; rabi onion stores well and Lasalgaon is 12 km away.', hi: 'काली मिट्टी और ड्रिप प्याज़ के लिए अच्छे हैं; रबी प्याज़ अच्छा टिकता है और लासलगांव 12 किमी है।', mr: 'काळी माती आणि ठिबक कांद्यासाठी योग्य; रब्बी कांदा चांगला टिकतो आणि लासलगाव 12 किमीवर आहे.' },
      timeline: [
        { title: { en: 'Nursery', hi: 'नर्सरी', mr: 'रोपवाटिका' }, tasks: [{ en: 'Raise seedlings on raised beds', hi: 'उठी क्यारियों पर पौध तैयार करें', mr: 'गादीवाफ्यावर रोपे तयार करा' }, { en: 'Treat seed with Trichoderma', hi: 'बीज को ट्राइकोडर्मा से उपचारित करें', mr: 'बियाण्याला ट्रायकोडर्मा लावा' }] },
        { title: { en: 'Field prep', hi: 'खेत की तैयारी', mr: 'शेत तयारी' }, tasks: [{ en: 'Plough and add 10 t compost per acre', hi: 'जुताई करें, प्रति एकड़ 10 टन खाद डालें', mr: 'नांगरणी करा, एकरी 10 टन शेणखत टाका' }] },
        { title: { en: 'Transplant', hi: 'रोपाई', mr: 'पुनर्लागवड' }, tasks: [{ en: 'Transplant 6-week seedlings, 15 × 10 cm', hi: '6 हफ्ते की पौध 15 × 10 सेमी पर रोपें', mr: '6 आठवड्यांची रोपे 15 × 10 सेमी अंतरावर लावा' }, { en: 'Light irrigation the same day', hi: 'उसी दिन हल्की सिंचाई', mr: 'त्याच दिवशी हलके पाणी' }] },
        { title: { en: 'Weeding + first dose', hi: 'निराई + पहली खाद', mr: 'खुरपणी + पहिला हप्ता' }, tasks: [{ en: 'Weed at 3 weeks', hi: '3 हफ्ते पर निराई', mr: '3 आठवड्यांनी खुरपणी' }, { en: 'Top-dress nitrogen', hi: 'नाइट्रोजन की ऊपरी खाद', mr: 'नत्राचा वरखत' }] },
        { title: { en: 'Watch for thrips & blotch', hi: 'थ्रिप्स और धब्बे पर नज़र', mr: 'फुलकिडे व करप्यावर लक्ष' }, tasks: [{ en: 'Scout twice a week', hi: 'हफ्ते में दो बार जाँचें', mr: 'आठवड्यातून दोनदा पहाणी' }] },
        { title: { en: 'Harvest', hi: 'कटाई', mr: 'काढणी' }, tasks: [{ en: 'Stop irrigation 2 weeks before', hi: '2 हफ्ते पहले सिंचाई बंद करें', mr: '2 आठवडे आधी पाणी बंद करा' }, { en: 'Cure in shade 10 days before storing', hi: 'भंडारण से पहले 10 दिन छाँव में सुखाएँ', mr: 'साठवणीपूर्वी 10 दिवस सावलीत सुकवा' }] },
      ],
    },
    {
      crop: 'wheat',
      name: { en: 'Wheat', hi: 'गेहूँ', mr: 'गहू' },
      suitability: 'medium',
      from: '11-01',
      to: '11-30',
      durationDays: 110,
      why: { en: 'Good if you have assured water for 5–6 irrigations.', hi: '5–6 सिंचाई का पक्का पानी हो तो अच्छा।', mr: '5–6 पाळ्यांचे खात्रीचे पाणी असल्यास चांगले.' },
      timeline: [
        { title: { en: 'Sowing', hi: 'बुवाई', mr: 'पेरणी' }, tasks: [{ en: 'Sow 40 kg seed per acre', hi: 'प्रति एकड़ 40 किलो बीज', mr: 'एकरी 40 किलो बियाणे' }] },
        { title: { en: 'Crown root irrigation', hi: 'शीर्ष जड़ सिंचाई', mr: 'मुकुटमूळ पाणी' }, tasks: [{ en: 'First irrigation at 21 days', hi: '21 दिन पर पहली सिंचाई', mr: '21 दिवसांनी पहिले पाणी' }] },
        { title: { en: 'Harvest', hi: 'कटाई', mr: 'काढणी' }, tasks: [{ en: 'Harvest when grains are hard', hi: 'दाने सख्त होने पर कटाई', mr: 'दाणे टणक झाल्यावर काढणी' }] },
      ],
    },
    {
      crop: 'gram',
      name: { en: 'Gram (chana)', hi: 'चना', mr: 'हरभरा' },
      suitability: 'high',
      from: '10-15',
      to: '11-15',
      durationDays: 100,
      why: { en: 'Needs little water and fixes nitrogen for your next onion crop.', hi: 'कम पानी चाहिए और अगली प्याज़ के लिए नाइट्रोजन देता है।', mr: 'कमी पाणी लागते आणि पुढच्या कांद्यासाठी नत्र स्थिर करतो.' },
      timeline: [
        { title: { en: 'Sowing', hi: 'बुवाई', mr: 'पेरणी' }, tasks: [{ en: 'Treat seed with Rhizobium', hi: 'बीज को राइज़ोबियम से उपचारित करें', mr: 'बियाण्याला रायझोबियम लावा' }] },
        { title: { en: 'Nipping', hi: 'खुंटाई', mr: 'शेंडे खुडणे' }, tasks: [{ en: 'Nip tips at 30 days for more branches', hi: '30 दिन पर सिरे तोड़ें', mr: '30 दिवसांनी शेंडे खुडा' }] },
        { title: { en: 'Pod borer watch', hi: 'फली छेदक पर नज़र', mr: 'घाटेअळीवर लक्ष' }, tasks: [{ en: 'Put up bird perches', hi: 'पक्षियों के बैठने के ठिकाने लगाएँ', mr: 'पक्षी थांबे लावा' }] },
      ],
    },
  ],
  kharif: [
    {
      crop: 'soybean',
      name: { en: 'Soybean', hi: 'सोयाबीन', mr: 'सोयाबीन' },
      suitability: 'high',
      from: '06-15',
      to: '07-10',
      durationDays: 100,
      why: { en: 'Sow after 75–100 mm of monsoon rain on black soil.', hi: 'काली मिट्टी पर 75–100 मिमी बारिश के बाद बोएँ।', mr: 'काळ्या मातीत 75–100 मिमी पावसानंतर पेरा.' },
      timeline: [
        { title: { en: 'Sowing', hi: 'बुवाई', mr: 'पेरणी' }, tasks: [{ en: 'Broad bed furrow sowing', hi: 'चौड़ी क्यारी नाली विधि', mr: 'रुंद वरंबा सरी पद्धत' }] },
        { title: { en: 'Weeding', hi: 'निराई', mr: 'खुरपणी' }, tasks: [{ en: 'Weed at 20 and 40 days', hi: '20 और 40 दिन पर निराई', mr: '20 व 40 दिवसांनी खुरपणी' }] },
        { title: { en: 'Harvest', hi: 'कटाई', mr: 'काढणी' }, tasks: [{ en: 'Harvest when 95% pods turn brown', hi: '95% फलियाँ भूरी होने पर', mr: '95% शेंगा तपकिरी झाल्यावर' }] },
      ],
    },
    {
      crop: 'tomato',
      name: { en: 'Tomato', hi: 'टमाटर', mr: 'टोमॅटो' },
      suitability: 'medium',
      from: '06-20',
      to: '07-31',
      durationDays: 130,
      why: { en: 'Pimpalgaon market is close; needs staking and good drainage.', hi: 'पिंपलगांव बाज़ार पास है; सहारा और अच्छी निकासी चाहिए।', mr: 'पिंपळगाव बाजार जवळ आहे; आधार आणि चांगला निचरा लागतो.' },
      timeline: [
        { title: { en: 'Nursery', hi: 'नर्सरी', mr: 'रोपवाटिका' }, tasks: [{ en: 'Raise seedlings under net', hi: 'जाली के नीचे पौध', mr: 'जाळीखाली रोपे' }] },
        { title: { en: 'Staking', hi: 'सहारा', mr: 'आधार देणे' }, tasks: [{ en: 'Stake at 3 weeks', hi: '3 हफ्ते पर सहारा', mr: '3 आठवड्यांनी आधार' }] },
      ],
    },
  ],
  zaid: [
    {
      crop: 'watermelon',
      name: { en: 'Watermelon', hi: 'तरबूज़', mr: 'कलिंगड' },
      suitability: 'medium',
      from: '01-15',
      to: '02-28',
      durationDays: 85,
      why: { en: 'Drip makes a summer crop possible; sells well in April.', hi: 'ड्रिप से गर्मी की फसल संभव; अप्रैल में अच्छा बिकता है।', mr: 'ठिबकमुळे उन्हाळी पीक शक्य; एप्रिलमध्ये चांगले विकते.' },
      timeline: [
        { title: { en: 'Sowing', hi: 'बुवाई', mr: 'पेरणी' }, tasks: [{ en: 'Sow on mulched beds', hi: 'मल्च वाली क्यारियों पर बोएँ', mr: 'आच्छादन केलेल्या वाफ्यांवर लावा' }] },
        { title: { en: 'Flowering', hi: 'फूल', mr: 'फुलोरा' }, tasks: [{ en: 'Keep bee boxes nearby', hi: 'पास में मधुमक्खी पेटी रखें', mr: 'जवळ मधमाशी पेट्या ठेवा' }] },
      ],
    },
  ],
}

/**
 * A sowing window given as month-day ('11-01' → '12-15'), placed on its NEXT
 * occurrence: this year while it is still open or ahead, otherwise next year.
 * Never a window that has already closed.
 */
export function rollWindow(from: string, to: string, today: string = todayIso()): { from: string; to: string } {
  const y = Number(today.slice(0, 4))
  const wraps = to < from // e.g. '12-01' → '01-31'
  for (const year of [y - 1, y, y + 1]) {
    const f = `${year}-${from}`
    const t = `${wraps ? year + 1 : year}-${to}`
    if (t >= today) return { from: f, to: t }
  }
  return { from: `${y + 1}-${from}`, to: `${wraps ? y + 2 : y + 1}-${to}` }
}

/** every crop's next sowing window, soonest first (used by the brief) */
export function upcomingSowing(today: string = todayIso()): { crop: string; season: Season; name: T3; from: string; to: string }[] {
  return (Object.keys(CROPS) as Season[])
    .flatMap((season) => CROPS[season].map((c) => ({ crop: c.crop, season, name: c.name, ...rollWindow(c.from, c.to, today) })))
    .sort((a, b) => a.from.localeCompare(b.from))
}

export function calendar(season: Season, lang: Lang): CalendarResponse {
  const today = todayIso()
  return {
    season,
    recommendations: (CROPS[season] ?? []).map((c) => ({
      crop: c.crop,
      name: L(c.name, lang),
      suitability: c.suitability,
      sowingWindow: rollWindow(c.from, c.to, today),
      durationDays: c.durationDays,
      why: L(c.why, lang),
      timeline: c.timeline.map((w, i) => ({ week: i * 2 + 1, title: L(w.title, lang), tasks: LA(w.tasks, lang) })),
    })),
  }
}

// ---- Schemes -------------------------------------------------------------

type SchemeSeed = { id: string; name: T3; benefit: T3; documents: T3[]; officialUrl: string; check: (a: SchemeAnswers) => [boolean, T3] }

const DOC = {
  aadhaar: { en: 'Aadhaar card', hi: 'आधार कार्ड', mr: 'आधार कार्ड' },
  satbara: { en: '7/12 land extract', hi: '7/12 भूमि अभिलेख', mr: '7/12 उतारा' },
  passbook: { en: 'Bank passbook', hi: 'बैंक पासबुक', mr: 'बँक पासबुक' },
  caste: { en: 'Caste certificate', hi: 'जाति प्रमाण पत्र', mr: 'जात प्रमाणपत्र' },
  sowing: { en: 'Sowing certificate', hi: 'बुवाई प्रमाण पत्र', mr: 'पेरणी प्रमाणपत्र' },
  quote: { en: 'Dealer quotation', hi: 'डीलर कोटेशन', mr: 'विक्रेत्याचे कोटेशन' },
}

const SCHEMES: SchemeSeed[] = [
  {
    id: 'pm-kisan',
    name: { en: 'PM-KISAN', hi: 'पीएम-किसान', mr: 'पीएम-किसान' },
    benefit: { en: '₹6,000 a year in 3 instalments', hi: 'साल में ₹6,000, 3 किस्तों में', mr: 'वर्षाला ₹6,000, 3 हप्त्यांत' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook],
    officialUrl: 'https://pmkisan.gov.in',
    check: (a) =>
      a.ownsLand && !a.incomeTaxPayer
        ? [true, { en: 'You own farmland and do not pay income tax', hi: 'आपके नाम खेती की ज़मीन है और आप आयकर नहीं भरते', mr: 'तुमच्या नावावर शेतजमीन आहे आणि तुम्ही आयकर भरत नाही' }]
        : [false, { en: 'Needs land in your name and no income tax', hi: 'आपके नाम ज़मीन और आयकर न भरना ज़रूरी', mr: 'तुमच्या नावावर जमीन आणि आयकर न भरणे आवश्यक' }],
  },
  {
    id: 'namo-shetkari',
    name: { en: 'Namo Shetkari Mahasanman Nidhi', hi: 'नमो शेतकरी महासम्मान निधि', mr: 'नमो शेतकरी महासन्मान निधी' },
    benefit: { en: 'Extra ₹6,000 a year from Maharashtra', hi: 'महाराष्ट्र से साल में ₹6,000 अतिरिक्त', mr: 'महाराष्ट्राकडून वर्षाला अतिरिक्त ₹6,000' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook],
    officialUrl: 'https://nsmny.mahait.org',
    check: (a) =>
      a.ownsLand && !a.incomeTaxPayer && a.hasBankAccount
        ? [true, { en: 'You qualify for PM-KISAN, so you get this too', hi: 'आप पीएम-किसान के पात्र हैं, इसलिए यह भी मिलेगा', mr: 'तुम्ही पीएम-किसानसाठी पात्र आहात, म्हणून हेही मिळेल' }]
        : [false, { en: 'Only for PM-KISAN farmers with a bank account', hi: 'केवल बैंक खाते वाले पीएम-किसान किसानों के लिए', mr: 'फक्त बँक खाते असलेल्या पीएम-किसान शेतकऱ्यांसाठी' }],
  },
  {
    id: 'pmfby',
    name: { en: 'PM Fasal Bima Yojana (crop insurance)', hi: 'पीएम फसल बीमा योजना', mr: 'पीएम पीक विमा योजना' },
    benefit: { en: 'Insurance for crop loss from rain, drought or pests', hi: 'बारिश, सूखा या कीट से फसल नुकसान का बीमा', mr: 'पाऊस, दुष्काळ किंवा किडीमुळे पिकाच्या नुकसानीचा विमा' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook, DOC.sowing],
    officialUrl: 'https://pmfby.gov.in',
    check: (a) =>
      a.hasBankAccount
        ? [true, { en: 'Open to owners and tenant farmers with a bank account', hi: 'बैंक खाते वाले मालिक और बटाईदार दोनों के लिए', mr: 'बँक खाते असलेले मालक व कुळ दोघांसाठी' }]
        : [false, { en: 'You need a bank account for the claim money', hi: 'दावे की रकम के लिए बैंक खाता चाहिए', mr: 'दाव्याच्या रकमेसाठी बँक खाते हवे' }],
  },
  {
    id: 'kcc',
    name: { en: 'Kisan Credit Card', hi: 'किसान क्रेडिट कार्ड', mr: 'किसान क्रेडिट कार्ड' },
    benefit: { en: 'Crop loan up to ₹3 lakh at 4% if repaid on time', hi: 'समय पर चुकाने पर 4% पर ₹3 लाख तक फसल ऋण', mr: 'वेळेवर फेडल्यास 4% दराने ₹3 लाखांपर्यंत पीक कर्ज' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook],
    officialUrl: 'https://www.myscheme.gov.in/schemes/kcc',
    check: (a) =>
      a.hasBankAccount && (a.ownsLand || a.landAcres > 0)
        ? [true, { en: 'You farm land and have a bank account', hi: 'आप खेती करते हैं और बैंक खाता है', mr: 'तुम्ही शेती करता आणि बँक खाते आहे' }]
        : [false, { en: 'Needs a bank account and land you farm', hi: 'बैंक खाता और खेती की ज़मीन चाहिए', mr: 'बँक खाते आणि कसत असलेली जमीन हवी' }],
  },
  {
    id: 'pmksy-drip',
    name: { en: 'PMKSY — Per Drop More Crop (drip subsidy)', hi: 'पीएमकेएसवाई — ड्रिप सब्सिडी', mr: 'पीएमकेएसवाय — ठिबक अनुदान' },
    benefit: { en: 'Up to 55% subsidy on drip/sprinkler for small farmers', hi: 'छोटे किसानों को ड्रिप/स्प्रिंकलर पर 55% तक सब्सिडी', mr: 'अल्पभूधारकांना ठिबक/तुषारवर 55% पर्यंत अनुदान' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook, DOC.quote],
    officialUrl: 'https://pmksy.gov.in',
    check: (a) =>
      a.ownsLand && a.irrigation !== 'drip' && a.irrigation !== 'sprinkler'
        ? [true, { en: "You own land and don't have drip yet", hi: 'आपके पास ज़मीन है और अभी ड्रिप नहीं है', mr: 'तुमची जमीन आहे आणि अजून ठिबक नाही' }]
        : [false, a.ownsLand ? { en: 'You already have drip or sprinkler', hi: 'आपके पास पहले से ड्रिप या स्प्रिंकलर है', mr: 'तुमच्याकडे आधीच ठिबक किंवा तुषार आहे' } : { en: 'Needs land in your name', hi: 'आपके नाम ज़मीन चाहिए', mr: 'तुमच्या नावावर जमीन हवी' }],
  },
  {
    id: 'soil-health-card',
    name: { en: 'Soil Health Card', hi: 'मृदा स्वास्थ्य कार्ड', mr: 'मृदा आरोग्य पत्रिका' },
    benefit: { en: 'Free soil test with fertiliser advice', hi: 'मुफ़्त मिट्टी जाँच और खाद की सलाह', mr: 'मोफत माती परीक्षण आणि खत सल्ला' },
    documents: [DOC.aadhaar, DOC.satbara],
    officialUrl: 'https://soilhealth.dac.gov.in',
    check: () => [true, { en: 'Open to every farmer', hi: 'हर किसान के लिए', mr: 'प्रत्येक शेतकऱ्यासाठी' }],
  },
  {
    id: 'mahadbt-mech',
    name: { en: 'MahaDBT farm mechanisation', hi: 'महाडीबीटी कृषि यंत्रीकरण', mr: 'महाडीबीटी कृषी यांत्रिकीकरण' },
    benefit: { en: '40–50% subsidy on tractor, rotavator, sprayer', hi: 'ट्रैक्टर, रोटावेटर, स्प्रेयर पर 40–50% सब्सिडी', mr: 'ट्रॅक्टर, रोटाव्हेटर, फवारणी यंत्रावर 40–50% अनुदान' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook, DOC.quote],
    officialUrl: 'https://mahadbt.maharashtra.gov.in',
    check: (a) =>
      a.ownsLand && a.hasAadhaar
        ? [true, { en: a.isWoman || a.category === 'sc' || a.category === 'st' ? 'You get the higher 50% rate' : 'You own land and have Aadhaar', hi: a.isWoman || a.category === 'sc' || a.category === 'st' ? 'आपको 50% की ऊँची दर मिलेगी' : 'आपके पास ज़मीन और आधार है', mr: a.isWoman || a.category === 'sc' || a.category === 'st' ? 'तुम्हाला 50% चा जास्त दर मिळेल' : 'तुमची जमीन आणि आधार आहे' }]
        : [false, { en: 'Needs land in your name and Aadhaar', hi: 'आपके नाम ज़मीन और आधार चाहिए', mr: 'तुमच्या नावावर जमीन आणि आधार हवे' }],
  },
  {
    id: 'ambedkar-swavalamban',
    name: { en: 'Dr. Babasaheb Ambedkar Krishi Swavalamban Yojana', hi: 'डॉ. बाबासाहेब आंबेडकर कृषि स्वावलंबन योजना', mr: 'डॉ. बाबासाहेब आंबेडकर कृषी स्वावलंबन योजना' },
    benefit: { en: 'Up to ₹2.5 lakh for a well, pump, drip', hi: 'कुआँ, पंप, ड्रिप के लिए ₹2.5 लाख तक', mr: 'विहीर, पंप, ठिबकसाठी ₹2.5 लाखांपर्यंत' },
    documents: [DOC.aadhaar, DOC.satbara, DOC.passbook, DOC.caste],
    officialUrl: 'https://mahadbt.maharashtra.gov.in',
    check: (a) =>
      a.category === 'sc' && a.ownsLand
        ? [true, { en: 'For SC farmers who own land', hi: 'ज़मीन वाले अनुसूचित जाति के किसानों के लिए', mr: 'जमीन असलेल्या अनुसूचित जातीच्या शेतकऱ्यांसाठी' }]
        : [false, { en: 'Only for SC farmers who own land', hi: 'केवल ज़मीन वाले अनुसूचित जाति के किसान', mr: 'फक्त जमीन असलेले अनुसूचित जातीचे शेतकरी' }],
  },
]

export function matchSchemes(answers: SchemeAnswers, lang: Lang): SchemeMatch {
  const schemes: SchemeResult[] = SCHEMES.map((s) => {
    const [eligible, reason] = s.check(answers)
    return {
      id: s.id,
      name: L(s.name, lang),
      eligible,
      reasons: [L(reason, lang)],
      benefit: L(s.benefit, lang),
      documents: LA(s.documents, lang),
      officialUrl: s.officialUrl,
    }
  })
  schemes.sort((a, b) => Number(b.eligible) - Number(a.eligible))
  return { schemes }
}
