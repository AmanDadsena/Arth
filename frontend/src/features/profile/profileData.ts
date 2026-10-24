import { useCallback, useSyncExternalStore } from 'react'
import type { FarmerProfile } from '@/lib/api/types'

/** Pure helpers and small device-local stores behind the Profile screen. */

export const APP_VERSION = '0.1.0'
export const REPO_URL = 'https://github.com/AmanDadsena/Arth'
export const FEEDBACK_EMAIL = 'feedback@arth.app'
export const KCC_TEL = 'tel:18001801551'

// ---- the optional "basic questions" ------------------------------------

export const OWNERSHIP = ['own', 'lease', 'both'] as const
export const FARMING = ['conventional', 'organic', 'mixed'] as const
export const GOALS = ['more_yield', 'better_price', 'less_cost', 'save_water', 'schemes', 'organic'] as const
export const SELLS_AT = ['mandi', 'trader', 'fpo', 'direct', 'contract'] as const
export const LIVESTOCK = ['cow', 'buffalo', 'goat', 'poultry', 'none'] as const

export type BasicField = 'experienceYears' | 'landOwnership' | 'farmingType' | 'goals' | 'sellsAt' | 'livestock'
export const BASIC_FIELDS: BasicField[] = ['experienceYears', 'landOwnership', 'farmingType', 'goals', 'sellsAt', 'livestock']

export const BASIC_OPTIONS: Record<Exclude<BasicField, 'experienceYears'>, readonly string[]> = {
  landOwnership: OWNERSHIP,
  farmingType: FARMING,
  goals: GOALS,
  sellsAt: SELLS_AT,
  livestock: LIVESTOCK,
}

export const MULTI: Record<BasicField, boolean> = {
  experienceYears: false,
  landOwnership: false,
  farmingType: false,
  goals: true,
  sellsAt: true,
  livestock: true,
}

export function hasBasic(f: FarmerProfile, k: BasicField): boolean {
  const v = f[k]
  if (v === undefined || v === null) return false
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** The core fields onboarding asks for, then the six optional basics. */
export function completeness(f: FarmerProfile) {
  const core = [
    f.name.trim(),
    f.village.trim(),
    f.district.trim(),
    f.crops.length > 0,
    f.landAcres > 0,
    f.soilType,
    f.irrigation,
    f.tankSizeLitres > 0,
  ].map(Boolean)
  const missing = BASIC_FIELDS.filter((k) => !hasBasic(f, k))
  const total = core.length + BASIC_FIELDS.length
  const done = core.filter(Boolean).length + (BASIC_FIELDS.length - missing.length)
  return { pct: Math.round((done / total) * 100), missing, coreMissing: core.some((c) => !c) }
}

// ---- alerts preferences, kept on this phone only ------------------------

export type AlertKey = 'rain' | 'price' | 'schemes'
export type AlertPrefs = Record<AlertKey, boolean>
const PREFS_KEY = 'arth.profile.alerts'
const DEFAULT_PREFS: AlertPrefs = { rain: true, price: true, schemes: false }
const listeners = new Set<() => void>()
let cache: AlertPrefs | null = null

function readPrefs(): AlertPrefs {
  if (cache) return cache
  let next = DEFAULT_PREFS
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) next = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<AlertPrefs>) }
  } catch {
    /* storage blocked or bad JSON: defaults */
  }
  cache = next
  return next
}

export function useAlertPrefs() {
  const prefs = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    readPrefs,
    () => DEFAULT_PREFS,
  )
  const toggle = useCallback((k: AlertKey) => {
    const cur = readPrefs()
    cache = { ...cur, [k]: !cur[k] }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(cache))
    } catch {
      /* lasts this session only */
    }
    listeners.forEach((l) => l())
  }, [])
  return { prefs, toggle }
}

// ---- connectivity --------------------------------------------------------

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

// ---- "Download my data" -------------------------------------------------

/** Hands the farmer a JSON copy of exactly what Arth keeps about them. Built on the phone; nothing is sent. */
export function downloadProfile(f: FarmerProfile) {
  const today = new Date().toISOString().slice(0, 10)
  const body = {
    app: 'Arth',
    exportedAt: new Date().toISOString(),
    note: 'This is everything Arth keeps in your profile. Photos and voice are never stored. Question history is redacted and deleted after 30 days.',
    profile: f,
  }
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `arth-my-data-${today}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---- share ----------------------------------------------------------------

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

export async function shareApp(title: string, text: string): Promise<ShareResult> {
  const url = window.location.origin
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text, url })
      return 'shared'
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}
