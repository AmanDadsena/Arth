import { getJson, liveFetch, peekCache, readStore, writeStore, type LiveSource } from './cache'
import { addDaysIso, fromDmy, todayIso } from './dates'

/**
 * Live mandi prices from data.gov.in — "Current Daily Price of Various
 * Commodities from Various Markets (Mandi)" (Agmarknet, Ministry of
 * Agriculture), resource 9ef84268-d588-465a-a308-a864a43d0070.
 *
 * - Browser-callable: the API answers CORS with the caller's origin.
 * - Needs an api-key. Set VITE_DATA_GOV_API_KEY (free key from a data.gov.in
 *   account). Without one we use the public sample key data.gov.in publishes
 *   on every dataset page; it is capped at 10 records per call and is
 *   rate-limited, so we make at most 3 small calls per commodity and cache
 *   for 6 h.
 * - It is a current-day feed (no history): see the price history below.
 * - Prices are ₹/quintal; arrival_date is dd/mm/yyyy.
 */

const RESOURCE = 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070'
/** public sample key shown on data.gov.in dataset pages (not a private key) */
const SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b'
const PRIVATE_KEY = ((import.meta.env.VITE_DATA_GOV_API_KEY as string | undefined) ?? '').trim()
const TTL_MS = 6 * 60 * 60_000 // 6 h
const STATE = 'Maharashtra'

/** our commodity ids → the dataset's commodity names */
export const DATASET_COMMODITY: Record<string, string> = {
  onion: 'Onion',
  soybean: 'Soyabean',
  tomato: 'Tomato',
  grapes: 'Grapes',
  wheat: 'Wheat',
  gram: 'Bengal Gram(Gram)(Whole)',
  cotton: 'Cotton',
  maize: 'Maize',
  pomegranate: 'Pomegranate',
  potato: 'Potato',
  tur: 'Arhar (Tur/Red Gram)(Whole)',
  jowar: 'Jowar(Sorghum)',
  bajra: 'Bajra(Pearl Millet/Cumbu)',
  chilli: 'Green Chilli',
  garlic: 'Garlic',
  brinjal: 'Brinjal',
  cabbage: 'Cabbage',
  banana: 'Banana',
  rice: 'Rice',
  groundnut: 'Groundnut',
}

export const hasLiveMandi = (commodity: string) => commodity in DATASET_COMMODITY

/** profile district spellings → the dataset's district names */
const DISTRICT_ALIAS: Record<string, string> = {
  ahmednagar: 'Ahilyanagar',
  ahmadnagar: 'Ahilyanagar',
  aurangabad: 'Chattrapati Sambhajinagar',
  'chhatrapati sambhajinagar': 'Chattrapati Sambhajinagar',
  osmanabad: 'Dharashiv',
  amravati: 'Amarawati',
  'mumbai suburban': 'Mumbai',
}

export function datasetDistrict(district: string | undefined): string | undefined {
  if (!district) return undefined
  const d = district.trim()
  return DISTRICT_ALIAS[d.toLowerCase()] ?? d
}

export interface LiveMandiRecord {
  /** market as the feed names it, trimmed, e.g. "APMC Lasalgaon", "Lasalgaon(Niphad)" */
  market: string
  /** exactly as the feed spells it (trailing spaces included) — needed to filter the history feed */
  rawMarket?: string
  district: string
  variety: string
  minPrice: number
  maxPrice: number
  modalPrice: number
  /** YYYY-MM-DD */
  arrivalDate: string
}

export interface LiveMandi {
  records: LiveMandiRecord[]
  source: LiveSource
  at: number
  ms: number
}

interface ApiRecord {
  state?: string
  district?: string
  market?: string
  commodity?: string
  variety?: string
  arrival_date?: string
  min_price?: number | string
  max_price?: number | string
  modal_price?: number | string
}
interface ApiResponse {
  records?: ApiRecord[]
  total?: number
  error?: string
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : NaN
}

function toRecord(r: ApiRecord): LiveMandiRecord | null {
  const modal = num(r.modal_price)
  const date = fromDmy(r.arrival_date ?? '')
  if (!r.market || !date || !(modal > 0)) return null
  const min = num(r.min_price)
  const max = num(r.max_price)
  return {
    market: r.market.replace(/\s+/g, ' ').trim(),
    rawMarket: r.market,
    district: (r.district ?? '').trim(),
    variety: (r.variety ?? '').trim(),
    modalPrice: modal,
    minPrice: min > 0 ? Math.min(min, modal) : modal,
    maxPrice: max > 0 ? Math.max(max, modal) : modal,
    arrivalDate: date,
  }
}

function pageUrl(commodity: string, limit: number, offset: number, district?: string) {
  const p = new URLSearchParams({ 'api-key': PRIVATE_KEY || SAMPLE_KEY, format: 'json', limit: String(limit), offset: String(offset) })
  p.set('filters[state.keyword]', STATE)
  p.set('filters[commodity]', commodity)
  if (district) p.set('filters[district]', district)
  return `${RESOURCE}?${p.toString()}`
}

async function fetchPage(url: string): Promise<LiveMandiRecord[]> {
  const j = await getJson<ApiResponse>(url)
  if (!Array.isArray(j.records)) throw new Error(j.error ?? 'bad response')
  return j.records.map(toRecord).filter((r): r is LiveMandiRecord => r !== null)
}

async function load(name: string, district?: string): Promise<LiveMandiRecord[] | null> {
  const urls = PRIVATE_KEY
    ? [pageUrl(name, 1000, 0)]
    : // sample key: 10 rows per call — the farmer's district first, then the state
      [...(district ? [pageUrl(name, 10, 0, district)] : []), pageUrl(name, 10, 0), pageUrl(name, 10, 10)]
  const pages = await Promise.allSettled(urls.map(fetchPage))
  if (pages.every((p) => p.status === 'rejected')) throw new Error('mandi feed unreachable')
  const seen = new Set<string>()
  const out: LiveMandiRecord[] = []
  for (const p of pages) {
    if (p.status !== 'fulfilled') continue
    for (const r of p.value) {
      const k = `${r.market}|${r.variety}|${r.arrivalDate}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(r)
    }
  }
  // an empty day (off-season, feed not yet posted) must not replace a good cached day
  return out.length ? out : null
}

const cacheKey = (commodity: string, district?: string) => `mandi.${commodity}.${(district ?? 'all').toLowerCase()}`

/** today's Maharashtra prices for one commodity: live → cached → null */
export async function getLiveMandi(commodity: string, district?: string): Promise<LiveMandi | null> {
  const name = DATASET_COMMODITY[commodity]
  if (!name) return null
  const t0 = performance.now()
  const d = datasetDistrict(district)
  const res = await liveFetch<LiveMandiRecord[]>(cacheKey(commodity, d), TTL_MS, () => load(name, d))
  if (!res) return null
  return { records: res.data, source: res.source, at: res.at, ms: Math.round(performance.now() - t0) }
}

/** whatever is cached for a commodity, without a request */
export function peekLiveMandi(commodity: string, district?: string): LiveMandi | null {
  const res = peekCache<LiveMandiRecord[]>(cacheKey(commodity, datasetDistrict(district)))
  return res ? { records: res.data, source: res.source, at: res.at, ms: 0 } : null
}

// ---- real price history (data.gov.in) -----------------------------------
// "Variety-wise Daily Market Prices Data of Commodity" (Agmarknet, DMI),
// resource 35985678-0d79-46b4-9ed6-6f13308a1d24: the same markets with past
// days, newest first. Its keys are capitalised (Market, Arrival_Date, …) and
// prices are strings. Two pages of 10 with the sample key ≈ the last 2–3 weeks.

const HISTORY_RESOURCE = 'https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24'
const HISTORY_TTL_MS = 12 * 60 * 60_000 // 12 h — it gains one day per day

interface HistoryApiRecord {
  Market?: string
  Variety?: string
  Arrival_Date?: string
  Modal_Price?: string | number
}

function historyUrl(commodity: string, rawMarket: string, limit: number, offset: number) {
  const p = new URLSearchParams({ 'api-key': PRIVATE_KEY || SAMPLE_KEY, format: 'json', limit: String(limit), offset: String(offset) })
  p.set('filters[State]', STATE)
  p.set('filters[Commodity]', commodity)
  p.set('filters[Market]', rawMarket)
  p.set('sort[Arrival_Date]', 'desc')
  return `${HISTORY_RESOURCE}?${p.toString()}`
}

async function loadHistory(name: string, rawMarket: string, variety: string | undefined): Promise<Record<string, number> | null> {
  const urls = PRIVATE_KEY ? [historyUrl(name, rawMarket, 120, 0)] : [historyUrl(name, rawMarket, 10, 0), historyUrl(name, rawMarket, 10, 10)]
  const pages = await Promise.allSettled(urls.map((u) => getJson<{ records?: HistoryApiRecord[] }>(u)))
  if (pages.every((p) => p.status === 'rejected')) throw new Error('history feed unreachable')
  // per day: the same variety as today's price when it traded, else the best-paid one
  const best: Record<string, { modal: number; same: boolean }> = {}
  for (const p of pages) {
    if (p.status !== 'fulfilled') continue
    for (const r of p.value.records ?? []) {
      const date = fromDmy(r.Arrival_Date ?? '')
      const modal = num(r.Modal_Price)
      if (!date || !(modal > 0)) continue
      const same = !!variety && (r.Variety ?? '').trim() === variety
      const prev = best[date]
      if (!prev || (same && !prev.same) || (same === prev.same && modal > prev.modal)) best[date] = { modal, same }
    }
  }
  const out: Record<string, number> = {}
  for (const [d, v] of Object.entries(best)) out[d] = v.modal
  return Object.keys(out).length ? out : null
}

const historyKey = (commodity: string, market: string) => `mandi.hist.${commodity}.${market.toLowerCase().replace(/[^a-z]/g, '')}`

/** past modal prices (date → ₹/quintal) for one market: live → cached → null */
export async function getLiveHistory(commodity: string, rec: LiveMandiRecord, cacheOnly = false): Promise<Record<string, number> | null> {
  const name = DATASET_COMMODITY[commodity]
  if (!name || !rec.rawMarket) return null
  const key = historyKey(commodity, rec.market)
  if (cacheOnly) return peekCache<Record<string, number>>(key)?.data ?? null
  const res = await liveFetch<Record<string, number>>(key, HISTORY_TTL_MS, () => loadHistory(name, rec.rawMarket!, rec.variety || undefined))
  return res?.data ?? null
}

// ---- on-device price history ---------------------------------------------
// The current feed is today-only, so we also keep one modal price per day per
// commodity+market on the device (it covers days the history feed has not
// published yet). The trend chart fills any days still missing from the
// seeded curve.

const HISTORY_KEY = 'mandi.history'
const KEEP_DAYS = 45

type History = Record<string, Record<string, number>>

export function recordPrice(commodity: string, market: string, date: string, modalPrice: number): void {
  const all = readStore<History>(HISTORY_KEY) ?? {}
  const k = `${commodity}|${market}`
  const series = { ...(all[k] ?? {}), [date]: modalPrice }
  const cutoff = addDaysIso(todayIso(), -KEEP_DAYS)
  for (const d of Object.keys(series)) if (d < cutoff) delete series[d]
  all[k] = series
  writeStore(HISTORY_KEY, all)
}

/** date → modal price seen live, for one commodity+market */
export function readPriceHistory(commodity: string, market: string): Record<string, number> {
  return readStore<History>(HISTORY_KEY)?.[`${commodity}|${market}`] ?? {}
}
