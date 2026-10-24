/**
 * Network-first fetching for public live sources, backed by a timestamped
 * localStorage copy so the app keeps working offline:
 *
 *   fresh cached copy (younger than ttl)  → used without a request
 *   otherwise network, ~6 s timeout       → stored, used
 *   network failed                        → last cached copy, however old
 *   nothing cached                        → null (callers use seeded data)
 *
 * Only public, non-personal responses go through here (weather, mandi prices).
 */

const PREFIX = 'arth.live.'
export const LIVE_TIMEOUT_MS = 6_000

export interface Cached<T> {
  data: T
  /** epoch ms the data was fetched */
  at: number
}

export type LiveSource = 'network' | 'cache' | 'stale-cache'

export interface LiveResult<T> extends Cached<T> {
  source: LiveSource
}

export function readCache<T>(key: string): Cached<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const c = JSON.parse(raw) as Cached<T>
    return c && typeof c.at === 'number' ? c : null
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, at: Date.now() } satisfies Cached<T>))
  } catch {
    /* storage full or blocked: live data still works for this page load */
  }
}

export function readStore<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeStore<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or blocked */
  }
}

/** GET a JSON URL with a timeout; throws on network error, timeout or non-2xx */
export async function getJson<T>(url: string, timeoutMs = LIVE_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// one request per key at a time: the brief, weather and calendar screens all
// ask for the same forecast at once
const inflight = new Map<string, Promise<unknown>>()

/**
 * `load` fetches and validates; it should throw (or return null) when the
 * response is unusable so a bad answer never replaces a good cached one.
 */
export async function liveFetch<T>(key: string, ttlMs: number, load: () => Promise<T | null>): Promise<LiveResult<T> | null> {
  const cached = readCache<T>(key)
  if (cached && Date.now() - cached.at < ttlMs) return { ...cached, source: 'cache' }

  const running = inflight.get(key) as Promise<LiveResult<T> | null> | undefined
  if (running) return running

  const p = (async (): Promise<LiveResult<T> | null> => {
    try {
      const data = await load()
      if (data !== null) {
        writeCache(key, data)
        return { data, at: Date.now(), source: 'network' }
      }
    } catch {
      /* offline, timed out, rate-limited or malformed — fall back below */
    }
    return cached ? { ...cached, source: 'stale-cache' } : null
  })()
  inflight.set(key, p)
  try {
    return await p
  } finally {
    inflight.delete(key)
  }
}

/** cached copy only (fresh or stale), never a request */
export function peekCache<T>(key: string): LiveResult<T> | null {
  const c = readCache<T>(key)
  return c ? { ...c, source: 'stale-cache' } : null
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** coordinates leave the device rounded to 2 decimals (~1 km), SPEC §5.8 */
export const round2 = (x: number) => Math.round(x * 100) / 100
