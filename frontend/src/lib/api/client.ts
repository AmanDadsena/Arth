import { getIdToken } from '../session'
import { env } from '../env'
import type {
  ApiErrorBody,
  Brief,
  CalendarResponse,
  CropDiagnosis,
  DeleteResult,
  DocumentExplanation,
  FarmerProfile,
  FarmerProfileInput,
  Health,
  LabelReading,
  Lang,
  MandiPrices,
  SchemeAnswers,
  SchemeMatch,
  Season,
  SellAdvice,
  SellAdviceRequest,
  ShareRequest,
  ShareResult,
  SoilReport,
  VoiceContext,
  VoiceResponse,
  Weather,
} from './types'

/**
 * Typed client for every endpoint in docs/SPEC.md §3.
 *
 * - Every request carries the sign-in ID token as a Bearer token (lib/session).
 * - A 401 signs the farmer out (see setUnauthorizedHandler).
 * - Everything is live: weather (Open-Meteo), mandi prices (Agmarknet) and
 *   Gemma 4 all answer through the backend. There is no sample data.
 * - /ai/* calls time out after 20 s with a retryable ApiError.
 */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
  get retryable() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500
  }
}

let onUnauthorized: () => void = () => {}
/** AuthProvider registers sign-out + redirect here. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

const AI_TIMEOUT_MS = 20_000
const DEFAULT_TIMEOUT_MS = 15_000

type Query = Record<string, string | number | boolean | undefined>

interface RequestOptions {
  query?: Query
  json?: unknown
  form?: FormData
}

function buildPath(path: string, query?: Query) {
  if (!query) return path
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined) qs.set(k, String(v))
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const fullPath = buildPath(path, opts.query)
  const isAi = path.startsWith('/ai/')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), isAi ? AI_TIMEOUT_MS : DEFAULT_TIMEOUT_MS)

  const headers: Record<string, string> = { ...(await authHeader()) }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }

  let res: Response
  try {
    res = await fetch(`${env.apiBaseUrl}${fullPath}`, {
      method,
      headers,
      body,
      signal: controller.signal,
      credentials: 'omit',
    })
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    throw new ApiError(timedOut ? 408 : 0, timedOut ? 'timeout' : 'network', timedOut ? 'Request timed out' : 'Network error')
  } finally {
    clearTimeout(timer)
  }
  return unwrap<T>(res, path)
}

async function unwrap<T>(res: Response, path: string): Promise<T> {
  if (res.status === 401) {
    onUnauthorized()
    throw new ApiError(401, 'unauthorized', 'Signed out')
  }
  if (!res.ok) {
    let code = 'http_' + res.status
    let message = res.statusText || 'Request failed'
    try {
      const b = (await res.json()) as ApiErrorBody
      if (b?.error) ({ code, message } = b.error)
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code, `${path}: ${message}`)
  }
  return (await res.json()) as T
}

function form(fields: Record<string, string | Blob | number | boolean | undefined>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    if (v instanceof Blob) f.append(k, v, v instanceof File ? v.name : k)
    else f.append(k, String(v))
  }
  return f
}

// ---- Endpoints -----------------------------------------------------------

export const api = {
  getHealth: () => request<Health>('GET', '/health'),

  getFarmer: () => request<FarmerProfile>('GET', '/farmer/me'),
  putFarmer: (profile: FarmerProfileInput) => request<FarmerProfile>('PUT', '/farmer/me', { json: profile }),
  deleteFarmer: () => request<DeleteResult>('DELETE', '/farmer/me'),

  getBrief: (lang: Lang) => request<Brief>('GET', '/brief', { query: { lang } }),

  getWeather: (lat: number, lon: number, lang: Lang) =>
    request<Weather>('GET', '/weather', { query: { lat, lon, lang } }),

  getMandiPrices: (commodity: string, lat: number, lon: number) =>
    request<MandiPrices>('GET', '/mandi/prices', { query: { commodity, lat, lon } }),
  postSellAdvice: (body: SellAdviceRequest) => request<SellAdvice>('POST', '/mandi/sell-advice', { json: body }),

  cropDoctor: (image: Blob, lang: Lang, crop?: string) =>
    request<CropDiagnosis>('POST', '/ai/crop-doctor', { form: form({ image, lang, crop }) }),
  labelReader: (image: Blob, lang: Lang, tankSizeLitres: number) =>
    request<LabelReading>('POST', '/ai/label-reader', { form: form({ image, lang, tankSizeLitres }) }),
  explainDocument: (image: Blob, lang: Lang) =>
    request<DocumentExplanation>('POST', '/ai/explain-document', { form: form({ image, lang, consent: true }) }),
  voice: (audio: Blob, lang: Lang, context: VoiceContext) =>
    request<VoiceResponse>('POST', '/ai/voice', {
      form: form({ audio, lang, context: JSON.stringify(context) }),
    }),

  /** no season: today's season, worked out by the backend */
  getCalendar: (season: Season | undefined, lang: Lang) =>
    request<CalendarResponse>('GET', '/calendar', { query: { season, lang } }),

  /** district soil for a point (onboarding) or, with no point, for the saved farm */
  getSoil: (lang: Lang, at?: { lat: number; lon: number; district?: string }) =>
    request<SoilReport>('GET', '/soil', { query: { lang, ...at } }),

  matchSchemes: (answers: SchemeAnswers, lang: Lang) =>
    request<SchemeMatch>('POST', '/schemes/match', { json: { answers, lang } }),
  /** opt-in only; the backend redacts and forwards to the cloud */
  shareScheme: (body: ShareRequest) => request<ShareResult>('POST', '/schemes/share', { json: body }),
}

export type Api = typeof api
