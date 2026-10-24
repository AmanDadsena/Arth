/** Commodities the mandi service has prices for (docs/SPEC.md §3 Mandi). */
export const MANDI_COMMODITIES = ['onion', 'soybean', 'tomato', 'grapes'] as const
export type MandiCommodity = (typeof MANDI_COMMODITIES)[number]

export function isMandiCommodity(c: string | null | undefined): c is MandiCommodity {
  return !!c && (MANDI_COMMODITIES as readonly string[]).includes(c)
}

/** The farmer's own crops first (in profile order), then the rest. */
export function orderedCommodities(crops: readonly string[]): MandiCommodity[] {
  const own = crops.filter(isMandiCommodity)
  const rest = MANDI_COMMODITIES.filter((c) => !own.includes(c))
  return [...new Set([...own, ...rest])]
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
