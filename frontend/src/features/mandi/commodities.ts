/**
 * Crops the mandi service has live prices for: every crop onboarding offers
 * (backend services/mandi.py MSAMB_CODES covers all of them).
 */
export const MANDI_COMMODITIES = [
  'onion', 'soybean', 'tomato', 'grapes', 'cotton', 'wheat', 'gram', 'sugarcane', 'pomegranate', 'maize',
] as const
export type MandiCommodity = (typeof MANDI_COMMODITIES)[number]

export function isMandiCommodity(c: string | null | undefined): c is MandiCommodity {
  return !!c && (MANDI_COMMODITIES as readonly string[]).includes(c)
}

/**
 * Only the farmer's own crops, in profile order: prices for crops they don't grow
 * are noise. A profile with none of them (older profiles) still gets the full list.
 */
export function farmerCommodities(crops: readonly string[]): MandiCommodity[] {
  const own = [...new Set(crops.filter(isMandiCommodity))]
  return own.length ? own : [...MANDI_COMMODITIES]
}

/** First profile crop that has price data, else onion (Nashik's main crop). */
export function defaultCommodity(crops: readonly string[]): MandiCommodity {
  return crops.find(isMandiCommodity) ?? 'onion'
}

/** Quantity typed by the farmer → quintals, or null when not usable. */
export const MAX_QUINTALS = 10_000
export function parseQuintals(raw: string): number | null {
  const n = Number(raw.trim())
  if (!raw.trim() || !Number.isFinite(n) || n <= 0 || n > MAX_QUINTALS) return null
  return Math.round(n * 10) / 10
}
